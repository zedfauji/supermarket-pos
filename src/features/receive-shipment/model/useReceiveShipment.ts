/* eslint-disable import/order */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  callReceiveShipment,
  type ReceiveShipmentRequest,
} from '@shared/lib/edge-function-contracts';
import { inventoryKeys } from '@entities/inventory';
import { purchaseOrderKeys } from '@entities/purchase-order';
export function useReceiveShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: ReceiveShipmentRequest) => callReceiveShipment(request),
    onSuccess: result => {
      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
        void queryClient.invalidateQueries({ queryKey: inventoryKeys.log() });
        void queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.all });
      }
    },
  });
}
