//! ESC/POS thermal receipt printing (58mm / 32 columns).
//! Line content (all labels, locale-translated) is built in TypeScript —
//! `bar-pos/src/shared/lib/receipt-format.ts` via `receiptDataToPrinterLines()`.
//! This module only ESC/POS-encodes the pre-formatted lines it receives; it
//! holds zero receipt-label strings.

use std::fs;
use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::prelude::*;
use image::imageops::colorops::{dither, BiLevel};
use image::imageops::FilterType;

const ESC: u8 = 0x1B;
const GS: u8 = 0x1D;

/// Real trust boundary for logo bytes: a direct `receipt_settings` UPDATE via
/// the Supabase client bypasses the browser canvas resizer's 200KB client-side
/// cap entirely, so this Rust-side cap (a generous margin over that UX-only
/// cap) is the one that actually protects `image::load_from_memory`.
const MAX_LOGO_DECODED_BYTES: usize = 512 * 1024;

/// Drawer kick: ESC p 0 0x19 0xFA
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
const DRAWER_PULSE: [u8; 5] = [ESC, 0x70, 0x00, 0x19, 0xFA];

fn lines_to_esc_pos(lines: &[String]) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&[ESC, b'@']);
    if let Some(first) = lines.first() {
        out.extend_from_slice(&[ESC, b'a', 1]);
        out.extend_from_slice(&[ESC, b'E', 1]);
        out.extend_from_slice(first.as_bytes());
        out.push(b'\n');
    }
    out.extend_from_slice(&[ESC, b'a', 0]);
    out.extend_from_slice(&[ESC, b'E', 0]);
    for line in lines.iter().skip(1) {
        out.extend_from_slice(line.as_bytes());
        out.push(b'\n');
    }
    out.extend_from_slice(&[GS, b'V', 0x42, 0x03]);
    out
}

/// Encodes decoded image bytes (PNG/JPEG) into an ESC/POS `GS v 0` monochrome
/// raster block: an 8-byte header followed by 1-bit-per-dot packed rows,
/// MSB-first, zero-padded on the trailing bits of a non-8-aligned width.
/// Never panics on malformed/attacker-controlled input — every failure path
/// returns `Err`.
fn encode_logo_raster(png_or_jpeg_bytes: &[u8], target_width_dots: u32) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(png_or_jpeg_bytes).map_err(|e| e.to_string())?;
    if img.width() == 0 || img.height() == 0 {
        return Err("Logo image has zero width or height".to_string());
    }

    let scale = target_width_dots as f32 / img.width() as f32;
    let target_height = ((img.height() as f32) * scale).round().max(1.0) as u32;

    let resized = img.resize(target_width_dots, target_height, FilterType::Lanczos3);
    let mut gray = resized.to_luma8();
    dither(&mut gray, &BiLevel);

    let width_bytes = (target_width_dots as usize).div_ceil(8);
    let height = gray.height();

    let mut out = vec![
        GS,
        b'v',
        b'0',
        0,
        (width_bytes & 0xFF) as u8,
        ((width_bytes >> 8) & 0xFF) as u8,
        (height & 0xFF) as u8,
        ((height >> 8) & 0xFF) as u8,
    ];

    for y in 0..height {
        for byte_i in 0..width_bytes {
            let mut byte = 0u8;
            for bit in 0..8u32 {
                let x = (byte_i as u32) * 8 + bit;
                if x < target_width_dots {
                    let pixel = gray.get_pixel(x, y).0[0];
                    if pixel == 0 {
                        byte |= 1 << (7 - bit);
                    }
                }
            }
            out.push(byte);
        }
    }

    Ok(out)
}

/// Strips the `data:image/png;base64,` prefix and decodes the payload,
/// rejecting oversized or malformed input before any bytes reach the image
/// decoder. Never panics on attacker-controlled input — every failure path
/// returns `Err`.
fn decode_data_url(data_url: &str) -> Result<Vec<u8>, String> {
    let (_, b64) = data_url
        .split_once(',')
        .ok_or_else(|| "Malformed data URL: no comma separator".to_string())?;
    let bytes = BASE64_STANDARD.decode(b64).map_err(|e| e.to_string())?;
    if bytes.len() > MAX_LOGO_DECODED_BYTES {
        return Err(format!(
            "Logo payload exceeds {MAX_LOGO_DECODED_BYTES} byte cap"
        ));
    }
    Ok(bytes)
}

// ASSUMED: 58mm(32-char)->384dot / 80mm(40/48-char)->576dot @203dpi — conventional ESC/POS mapping, not verified against this store's actual printer hardware spec sheet (RESEARCH.md Assumption A1 / Open Question 2). Adjust this mapping if the real printer differs.
fn dot_width_for_paper(paper_width_chars: u16) -> u32 {
    if paper_width_chars <= 32 {
        384
    } else {
        576
    }
}

/// Assembles the full print payload: an optional GS v0 logo raster block
/// (best-effort — any decode/encode failure is logged and skipped, never
/// fails the whole print job) followed by the text lines.
fn build_print_payload(lines: &[String], logo_data_url: Option<&str>, paper_width_chars: u16) -> Vec<u8> {
    let mut out = Vec::new();

    if let Some(url) = logo_data_url {
        match decode_data_url(url)
            .and_then(|bytes| encode_logo_raster(&bytes, dot_width_for_paper(paper_width_chars)))
        {
            Ok(raster) => out.extend_from_slice(&raster),
            Err(e) => eprintln!("[printer] WARNING: logo raster failed: {e}"),
        }
    }

    out.extend_from_slice(&lines_to_esc_pos(lines));
    out
}

fn write_fallback_bytes(bytes: &[u8]) -> Result<(), String> {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let path = std::env::temp_dir().join(format!("receipt_{ts}.prn"));
    let mut f = fs::File::create(&path).map_err(|e| e.to_string())?;
    f.write_all(bytes).map_err(|e| e.to_string())?;
    eprintln!(
        "[printer] WARNING: no printer or print failed; wrote ESC/POS bytes to {}",
        path.display()
    );
    Ok(())
}

#[cfg(target_os = "windows")]
mod win_print {
    use windows::core::{HSTRING, PWSTR};
    use windows::Win32::Graphics::Printing::{
        ClosePrinter, DOC_INFO_1W, EndDocPrinter, GetDefaultPrinterW, OpenPrinterW, PRINTER_HANDLE,
        StartDocPrinterW, WritePrinter,
    };

    pub fn default_printer_name() -> Result<HSTRING, String> {
        let mut buf = vec![0u16; 512];
        let mut size = buf.len() as u32;
        let ok = unsafe { GetDefaultPrinterW(Some(PWSTR(buf.as_mut_ptr())), &mut size) };
        if ok.0 == 0 {
            return Err("No default Windows printer is configured.".to_string());
        }
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        let s = String::from_utf16_lossy(&buf[..end]);
        if s.trim().is_empty() {
            return Err("Default printer name is empty.".to_string());
        }
        Ok(HSTRING::from(s))
    }

    pub fn send_raw(bytes: &[u8]) -> Result<(), String> {
        let name = default_printer_name()?;
        let mut handle = PRINTER_HANDLE::default();
        unsafe {
            OpenPrinterW(&name, &mut handle, None)
                .map_err(|e| format!("OpenPrinter failed: {}", e.message()))?;
        }
        let mut doc_name: Vec<u16> = "Receipt\0".encode_utf16().collect();
        let mut datatype: Vec<u16> = "RAW\0".encode_utf16().collect();
        let doc_info = DOC_INFO_1W {
            pDocName: PWSTR(doc_name.as_mut_ptr()),
            pOutputFile: PWSTR::null(),
            pDatatype: PWSTR(datatype.as_mut_ptr()),
        };
        let job = unsafe { StartDocPrinterW(handle, 1, &doc_info) };
        if job == 0 {
            let _ = unsafe { ClosePrinter(handle) };
            return Err("StartDocPrinter failed (returned job id 0).".to_string());
        }
        let mut written: u32 = 0;
        let ok = unsafe {
            WritePrinter(
                handle,
                bytes.as_ptr().cast(),
                bytes.len() as u32,
                std::ptr::addr_of_mut!(written),
            )
        };
        unsafe {
            let _ = EndDocPrinter(handle);
            let _ = ClosePrinter(handle);
        }
        if ok.0 == 0 || written != bytes.len() as u32 {
            return Err("WritePrinter failed or incomplete write.".to_string());
        }
        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn try_send_raw(bytes: &[u8]) -> Result<(), String> {
    win_print::send_raw(bytes)
}

#[cfg(not(target_os = "windows"))]
#[allow(dead_code)]
fn try_send_raw(_bytes: &[u8]) -> Result<(), String> {
    Err("Thermal printer is only supported on Windows.".to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub fn print_receipt(
    lines: Vec<String>,
    logo_data_url: Option<String>,
    paper_width_chars: u16,
) -> Result<(), String> {
    let bytes = build_print_payload(&lines, logo_data_url.as_deref(), paper_width_chars);

    #[cfg(target_os = "windows")]
    {
        match try_send_raw(&bytes) {
            Ok(()) => Ok(()),
            Err(e) => {
                eprintln!("[printer] WARNING: {e}");
                write_fallback_bytes(&bytes)
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        eprintln!("[printer] WARNING: non-Windows host; writing receipt bytes to temp file");
        write_fallback_bytes(&bytes)
    }
}

#[tauri::command]
pub fn open_cash_drawer() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        try_send_raw(&DRAWER_PULSE)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Thermal printer is only supported on Windows.".to_string())
    }
}

/// Response shape for a durably-accepted broker job (Phase 19: Store-Local
/// Durable Printing Service). `job_id` is the broker's stable UUID for this
/// print job — never a Windows spooler job id.
#[derive(serde::Serialize, serde::Deserialize)]
pub struct PrintJobAck {
    pub job_id: String,
    pub status: String,
}

const BROKER_URL: &str = "http://127.0.0.1:8973";
const BROKER_CONNECT_TIMEOUT_MS: u64 = 1500;

/// Wave-2 (Plan 19-02) placeholder: reads the per-store secret from
/// `%ProgramData%\PrintBroker\client-secret.txt` (first line, trimmed) when
/// present; falls back to a hardcoded dev-only secret otherwise. This
/// function's signature does not change in 19-02 — only what the file
/// contains (a real per-store install-time-generated secret) changes. This is
/// a second, independent implementation of the same logic as
/// `broker/src/http.rs`'s `resolve_broker_secret()` — no shared crate needed
/// for one function.
fn resolve_broker_secret() -> String {
    let base = std::env::var("ProgramData").unwrap_or_else(|_| "C:\\ProgramData".to_string());
    let path = std::path::PathBuf::from(base)
        .join("PrintBroker")
        .join("client-secret.txt");
    if let Ok(content) = fs::read_to_string(&path) {
        if let Some(first_line) = content.lines().next() {
            let trimmed = first_line.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    "dev-only-insecure-secret-CHANGE-AT-INSTALL".to_string()
}

/// Submits a print job to the store-local broker over authenticated HTTP.
/// Never falls back to a direct-WinSpool path on failure — an unreachable
/// broker, a rejected job, or a persistence failure must surface as a real
/// error, not a silent success (PRN-02). D-12: explicit ~1.5s connect-timeout
/// and the IPv4 literal `127.0.0.1` (never the hostname `localhost`, which
/// can add dual-stack DNS resolution delay before a connection attempt).
async fn submit_to_broker(
    payload: &[u8],
    printer_name: &str,
    origin: &str,
) -> Result<PrintJobAck, String> {
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_millis(BROKER_CONNECT_TIMEOUT_MS))
        .build()
        .map_err(|e| e.to_string())?;

    let body = serde_json::json!({
        "idempotency_key": uuid::Uuid::new_v4().to_string(),
        "printer_name": printer_name,
        "payload_b64": BASE64_STANDARD.encode(payload),
        "origin": origin,
    });

    let resp = client
        .post(format!("{BROKER_URL}/jobs"))
        .bearer_auth(resolve_broker_secret())
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("broker unreachable: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("broker rejected job: HTTP {}", resp.status()));
    }
    resp.json::<PrintJobAck>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn test_print() -> Result<PrintJobAck, String> {
    let lines = vec![
        "Bar POS".to_string(),
        "TEST PRINT".to_string(),
        String::new(),
    ];
    let bytes = lines_to_esc_pos(&lines);
    submit_to_broker(&bytes, "RECEIPT_PRINTER", "test_print").await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Encodes a solid-color `width`x`height` RGB fixture as an in-memory PNG,
    /// exercising the real `image::load_from_memory` decode path in tests
    /// rather than just the packing math in isolation.
    fn solid_fixture_png(width: u32, height: u32, rgb: [u8; 3]) -> Vec<u8> {
        let img = image::RgbImage::from_fn(width, height, |_, _| image::Rgb(rgb));
        let mut buf = Vec::new();
        image::DynamicImage::ImageRgb8(img)
            .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
            .expect("encoding fixture PNG must not fail");
        buf
    }

    #[test]
    fn encode_logo_raster_solid_black_8x8() {
        let png = solid_fixture_png(8, 8, [0, 0, 0]);
        let out = encode_logo_raster(&png, 8).expect("encode must succeed");
        assert_eq!(&out[0..8], &[0x1D, 0x76, 0x30, 0x00, 0x01, 0x00, 0x08, 0x00]);
        assert_eq!(&out[8..], &[0xFF; 8]);
    }

    #[test]
    fn encode_logo_raster_solid_white_8x8() {
        let png = solid_fixture_png(8, 8, [255, 255, 255]);
        let out = encode_logo_raster(&png, 8).expect("encode must succeed");
        assert_eq!(&out[0..8], &[0x1D, 0x76, 0x30, 0x00, 0x01, 0x00, 0x08, 0x00]);
        assert_eq!(&out[8..], &[0x00; 8]);
    }

    #[test]
    fn encode_logo_raster_non_multiple_of_8_width_pads_with_zero() {
        let png = solid_fixture_png(12, 12, [0, 0, 0]);
        let out = encode_logo_raster(&png, 12).expect("encode must succeed");
        // width_bytes = ceil(12/8) = 2, height = 12 -> header yL=12,yH=0
        assert_eq!(&out[0..8], &[0x1D, 0x76, 0x30, 0x00, 0x02, 0x00, 0x0C, 0x00]);
        let data = &out[8..];
        assert_eq!(data.len(), 2 * 12);
        for row in data.chunks(2) {
            assert_eq!(row, &[0xFF, 0xF0]);
        }
    }

    #[test]
    fn decode_data_url_rejects_oversized_payload_before_image_decode() {
        // A base64 payload whose decoded length exceeds the 512KB cap must be
        // rejected by decode_data_url alone, never reaching image::load_from_memory.
        let oversized_bytes = vec![0u8; MAX_LOGO_DECODED_BYTES + 1];
        let b64 = BASE64_STANDARD.encode(&oversized_bytes);
        let data_url = format!("data:image/png;base64,{b64}");
        let result = decode_data_url(&data_url);
        assert!(result.is_err());
    }

    #[test]
    fn encode_logo_raster_returns_err_not_panic_on_non_image_bytes() {
        let not_a_real_png = b"not a real png";
        let result = encode_logo_raster(not_a_real_png, 8);
        assert!(result.is_err());
    }

    #[test]
    fn decode_data_url_rejects_missing_comma_separator() {
        let malformed = "data:image/png;base64NOCOMMA";
        let result = decode_data_url(malformed);
        assert!(result.is_err());
    }
}
