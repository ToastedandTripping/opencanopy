declare module "scrollama" {
  interface ScrollamaInstance {
    setup(options: {
      step: string | HTMLElement[];
      offset?: number;
      progress?: boolean;
      threshold?: number;
      debug?: boolean;
    }): ScrollamaInstance;
    onStepEnter(
      callback: (response: {
        element: HTMLElement;
        index: number;
        direction: "up" | "down";
      }) => void
    ): ScrollamaInstance;
    onStepExit(
      callback: (response: {
        element: HTMLElement;
        index: number;
        direction: "up" | "down";
      }) => void
    ): ScrollamaInstance;
    onStepProgress(
      callback: (response: {
        element: HTMLElement;
        index: number;
        progress: number;
      }) => void
    ): ScrollamaInstance;
    resize(): void;
    destroy(): void;
  }
  export default function scrollama(): ScrollamaInstance;
}
