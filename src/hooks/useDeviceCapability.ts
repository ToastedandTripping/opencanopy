"use client";

import { useEffect, useState } from "react";

interface DeviceCapability {
  supports3D: boolean;
  isMobile: boolean;
}

export function useDeviceCapability(): DeviceCapability {
  const [capability, setCapability] = useState<DeviceCapability>({
    supports3D: true,
    isMobile: false,
  });

  useEffect(() => {
    const lowCores =
      typeof navigator !== "undefined" &&
      typeof navigator.hardwareConcurrency === "number" &&
      navigator.hardwareConcurrency < 4;

    const narrowScreen = window.innerWidth < 768;

    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

    const isMobile = narrowScreen || coarsePointer;
    const supports3D = !lowCores && !isMobile;

    setCapability({ supports3D, isMobile });
  }, []);

  return capability;
}
