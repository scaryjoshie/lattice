import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PaneState } from "../../protocol.ts";
import { PROVIDER_LABEL, ProviderIcon } from "../icons.tsx";
import { Term } from "../terminal/Term.tsx";
import { CLOSE, expandedRect, OPEN, type Rect, REVEAL } from "./transition.ts";

/**
 * The pane, lifted off the canvas. It grows from the rectangle it occupied on screen
 * into the window, and shrinks back into the same place.
 *
 * The terminal is mounted only after the chrome has arrived. Animating a live terminal's
 * box would reflow it every frame, which is both slow and wrong.
 */
export function Expanded({
  pane,
  from,
  onClose,
}: {
  pane: PaneState | null;
  from: Rect | null;
  onClose(): void;
}) {
  const [target, setTarget] = useState<Rect>(expandedRect);
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    const onResize = () => setTarget(expandedRect());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!pane) setArrived(false);
    else setTarget(expandedRect());
  }, [pane]);

  return createPortal(
    <AnimatePresence>
      {pane && from && (
        <>
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={REVEAL}
            onClick={onClose}
          />
          <motion.div
            className="pane expanded"
            initial={{ ...from }}
            animate={{ ...target }}
            exit={{ ...from }}
            transition={pane ? OPEN : CLOSE}
            onAnimationComplete={() => setArrived(true)}
          >
            {arrived ? (
              <Term id={pane.id} width={target.width} height={target.height} />
            ) : (
              <ProviderIcon provider={pane.provider} className="pane-watermark" />
            )}
            <motion.span
              className="pane-label"
              initial={{ opacity: 0 }}
              animate={{ opacity: arrived ? 0 : 1 }}
              transition={REVEAL}
            >
              {PROVIDER_LABEL[pane.provider]}
            </motion.span>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
