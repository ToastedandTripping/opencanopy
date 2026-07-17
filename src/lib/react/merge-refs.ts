import type { Ref, RefCallback } from "react";

/**
 * Combines multiple refs into a single ref callback so one DOM node can
 * satisfy two hooks that each need their own ref to it -- e.g. the mobile
 * sheet's existing useDragDismiss `sheetRef` and useDialogA11y's container
 * ref (P2 a11y relay, part C). A JSX element only accepts one `ref` prop,
 * so this is the standard way to attach more than one.
 */
export function mergeRefs<T>(...refs: Array<Ref<T> | undefined | null>): RefCallback<T> {
  return (node: T | null) => {
    for (const ref of refs) {
      if (ref == null) continue;
      if (typeof ref === "function") {
        ref(node);
      } else {
        (ref as { current: T | null }).current = node;
      }
    }
  };
}
