import { useCallback, useRef, useState } from 'react';

/**
 * Collapses actions once their container would overflow horizontally.
 * Attach the returned ref to the container; it expands again once the
 * container regains the width it needed before collapsing.
 */
export function useOverflowCollapse<T extends HTMLElement>() {
    const [collapsed, setCollapsed] = useState(false);
    const collapsedRef = useRef(false);
    const neededWidth = useRef(0);
    const ref = useCallback((el: T | null) => {
        if (!el) return;
        const update = (next: boolean) => {
            if (collapsedRef.current === next) return;
            collapsedRef.current = next;
            setCollapsed(next);
        };
        const check = () => {
            if (!collapsedRef.current && el.scrollWidth > el.clientWidth + 1) {
                neededWidth.current = el.scrollWidth;
                update(true);
            } else if (collapsedRef.current && el.clientWidth >= neededWidth.current) {
                update(false);
            }
        };
        const observer = new ResizeObserver(check);
        observer.observe(el);
        if (el.firstElementChild) observer.observe(el.firstElementChild);
        return () => observer.disconnect();
    }, []);
    return { ref, collapsed };
}
