import { useEffect } from "react";
import { subscribeOffline } from "./runtime";

export function useSyncRefresh(refresh: (value?: boolean) => Promise<void>) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const remove = subscribeOffline(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void refresh(true);
      }, 250);
    });
    return () => {
      clearTimeout(timer);
      remove();
    };
  }, [refresh]);
}
