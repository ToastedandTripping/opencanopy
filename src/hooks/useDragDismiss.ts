"use client";

import { useCallback, useRef } from "react";

/**
 * Drag-to-dismiss for mobile bottom sheets.
 * Tracks a downward touch drag on the sheet element; past 100px the sheet
 * animates off-screen and `onClose` fires, otherwise it springs back.
 *
 * `active` gates the gesture for panels that stay mounted while hidden
 * (e.g. CalculatorPanel) so a hidden sheet can't capture touches.
 */
export function useDragDismiss(onClose: () => void, active: boolean = true) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const currentTranslateY = useRef(0);
  const isDragging = useRef(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!active) return;
      const touch = e.touches[0];
      dragStartY.current = touch.clientY;
      currentTranslateY.current = 0;
      isDragging.current = true;
      if (sheetRef.current) {
        sheetRef.current.style.transition = "none";
      }
    },
    [active],
  );

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !sheetRef.current) return;
    const touch = e.touches[0];
    const deltaY = touch.clientY - dragStartY.current;
    if (deltaY > 0) {
      currentTranslateY.current = deltaY;
      sheetRef.current.style.transform = `translateY(${deltaY}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current || !sheetRef.current) return;
    isDragging.current = false;
    const sheet = sheetRef.current;
    sheet.style.transition = "transform 300ms ease-out";
    if (currentTranslateY.current > 100) {
      sheet.style.transform = "translateY(100%)";
      setTimeout(onClose, 300);
    } else {
      sheet.style.transform = "translateY(0)";
    }
    currentTranslateY.current = 0;
  }, [onClose]);

  return { sheetRef, handleTouchStart, handleTouchMove, handleTouchEnd };
}
