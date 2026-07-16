"use client";

import { useState } from "react";

interface DeviceCapability {
  supports3D: boolean;
  isMobile: boolean;
}

/** SSR-safe default — matches the prerendered markup (client-only MapLibre canvas). */
const SSR_DEFAULT: DeviceCapability = { supports3D: true, isMobile: false };

function computeDeviceCapability(): DeviceCapability {
  if (typeof window === "undefined") return SSR_DEFAULT;

  const lowCores =
    typeof navigator !== "undefined" &&
    typeof navigator.hardwareConcurrency === "number" &&
    navigator.hardwareConcurrency < 4;

  const narrowScreen = window.innerWidth < 768;

  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

  const isMobile = narrowScreen || coarsePointer;
  const supports3D = !lowCores && !isMobile;

  return { supports3D, isMobile };
}

/**
 * P1c hydration-safety note: this reads window/navigator in a lazy useState
 * initializer rather than an effect. Confirmed safe because supports3D/isMobile
 * feed only StoryMap's client-only MapLibre canvas — a subtree that renders no
 * prerendered markup — so there is no server-rendered DOM for the client's
 * first-paint value to mismatch against. (Contrast with useLayerState, which
 * deliberately keeps its post-mount-effect pattern because its state drives
 * SSR-rendered aria-checked attributes.)
 */
export function useDeviceCapability(): DeviceCapability {
  const [capability] = useState<DeviceCapability>(computeDeviceCapability);
  return capability;
}
