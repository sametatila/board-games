"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/** Cross-browser custom scrollbar wrapper.
 *
 *  Native browser scrollbars (especially Opera/Edge on Windows) ignore
 *  most CSS overrides and keep drawing OS-level chrome — including the
 *  up/down arrow buttons. To get a fully styled bar that matches our
 *  dark slate UI, we hide the native scrollbar by pushing the inner
 *  scrollable element's right edge past the outer container's clip
 *  boundary, then draw our own thumb/track on top with a div.
 *
 *  Usage:
 *    <Scrollable className="max-h-48">
 *      ...long content...
 *    </Scrollable>
 *
 *  Notes:
 *  - Scrolling still works with mouse wheel, touchpad, keyboard,
 *    spacebar — the inner element is a normal scroll container.
 *  - The custom thumb is draggable; clicking the track jumps the page.
 *  - The hidden native scrollbar reservation is 20px on the right;
 *    this is fine because we draw our own 8px thumb 4px from the edge.
 */
export type ScrollableHandle = {
  /** The actual scroll viewport. Use this if you need to read or
   *  write scrollTop directly (e.g. auto-scroll on new chat msg). */
  el: HTMLDivElement | null;
  scrollToBottom: () => void;
};

export const Scrollable = forwardRef<
  ScrollableHandle,
  {
    children: ReactNode;
    className?: string;
    style?: CSSProperties;
  }
>(function Scrollable({ children, className = "", style }, externalRef) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [thumbHeight, setThumbHeight] = useState(0);
  const [thumbTop, setThumbTop] = useState(0);
  const [trackHeight, setTrackHeight] = useState(0);
  const [hovered, setHovered] = useState(false);
  const dragStateRef = useRef<{
    startY: number;
    startScroll: number;
  } | null>(null);

  useImperativeHandle(
    externalRef,
    () => ({
      get el() {
        return innerRef.current;
      },
      scrollToBottom() {
        if (innerRef.current) {
          innerRef.current.scrollTop = innerRef.current.scrollHeight;
        }
      },
    }),
    [],
  );

  const recompute = useCallback(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const scrollH = inner.scrollHeight;
    const clientH = inner.clientHeight;
    setTrackHeight(clientH);
    if (scrollH <= clientH) {
      setThumbHeight(0);
      return;
    }
    const ratio = clientH / scrollH;
    const computed = Math.max(24, clientH * ratio);
    setThumbHeight(computed);
    const maxThumbTop = clientH - computed;
    const maxScroll = scrollH - clientH;
    setThumbTop(maxScroll > 0 ? (inner.scrollTop / maxScroll) * maxThumbTop : 0);
  }, []);

  useLayoutEffect(() => {
    recompute();
  });

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const onScroll = () => recompute();
    inner.addEventListener("scroll", onScroll, { passive: true });
    // ResizeObserver picks up content growth (chat messages arriving,
    // panels expanding) so the thumb height stays accurate.
    const ro = new ResizeObserver(() => recompute());
    ro.observe(inner);
    for (const child of Array.from(inner.children)) ro.observe(child);
    return () => {
      inner.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [recompute]);

  // Drag handler bound at document level so the thumb keeps moving
  // even when the mouse leaves the track.
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const drag = dragStateRef.current;
      const inner = innerRef.current;
      if (!drag || !inner) return;
      const dy = e.clientY - drag.startY;
      const clientH = inner.clientHeight;
      const scrollH = inner.scrollHeight;
      const maxScroll = scrollH - clientH;
      const maxThumbTop = clientH - thumbHeight;
      if (maxThumbTop <= 0) return;
      const newScroll = drag.startScroll + (dy / maxThumbTop) * maxScroll;
      inner.scrollTop = Math.max(0, Math.min(maxScroll, newScroll));
    }
    function onUp() {
      dragStateRef.current = null;
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [thumbHeight]);

  function onThumbDown(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const inner = innerRef.current;
    if (!inner) return;
    dragStateRef.current = {
      startY: e.clientY,
      startScroll: inner.scrollTop,
    };
    document.body.style.userSelect = "none";
  }

  function onTrackDown(e: React.MouseEvent) {
    const inner = innerRef.current;
    const outer = outerRef.current;
    if (!inner || !outer) return;
    const rect = outer.getBoundingClientRect();
    const localY = e.clientY - rect.top;
    const clientH = inner.clientHeight;
    const scrollH = inner.scrollHeight;
    const maxScroll = scrollH - clientH;
    const maxThumbTop = clientH - thumbHeight;
    if (maxThumbTop <= 0) return;
    const targetThumbTop = Math.max(
      0,
      Math.min(maxThumbTop, localY - thumbHeight / 2),
    );
    inner.scrollTop = (targetThumbTop / maxThumbTop) * maxScroll;
  }

  return (
    <div
      ref={outerRef}
      className={`relative overflow-hidden ${className}`}
      style={style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Inner scroll viewport. Width-wise we extend past the outer
          right edge so the native scrollbar (which can't be styled in
          some browsers) is clipped off-screen. Height is auto — that
          way the inner div takes its content's height up to the
          outer's max-height, regardless of whether the parent gave us
          an explicit size or not. */}
      <div
        ref={innerRef}
        style={{
          maxHeight: "inherit",
          height: "100%",
          width: "calc(100% + 20px)",
          paddingRight: 20,
          overflowY: "auto",
          overflowX: "hidden",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
      {thumbHeight > 0 && (
        <div
          className="absolute right-1 top-0 w-2"
          style={{
            height: trackHeight,
            opacity: hovered ? 1 : 0.45,
            transition: "opacity 200ms ease",
          }}
          onMouseDown={onTrackDown}
        >
          {/* track background */}
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: "rgba(15, 23, 42, 0.45)" }}
          />
          {/* draggable thumb */}
          <div
            className="absolute right-0 w-2 rounded-full"
            style={{
              top: thumbTop,
              height: thumbHeight,
              background: hovered
                ? "rgba(203, 213, 225, 0.85)"
                : "rgba(148, 163, 184, 0.55)",
              cursor: "grab",
              transition: "background-color 200ms ease",
            }}
            onMouseDown={onThumbDown}
          />
        </div>
      )}
    </div>
  );
});
