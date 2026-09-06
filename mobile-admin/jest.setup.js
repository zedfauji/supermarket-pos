jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
// Pure helpers are what unit tests cover; the Supabase client itself is never exercised in jest.
jest.mock('./src/lib/supabase', () => ({ supabase: {}, SUPABASE_URL: 'http://test' }));
