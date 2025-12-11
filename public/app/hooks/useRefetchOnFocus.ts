import { useEffect, useRef } from 'react';

export function useRefetchOnFocus(refetch: () => void) {
    const refetchRef = useRef(refetch);

    useEffect(() => {
        refetchRef.current = refetch;
    }, [refetch]);

    useEffect(() => {
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                refetchRef.current();
            }
        };

        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, []);
}