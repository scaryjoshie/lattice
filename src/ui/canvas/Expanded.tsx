import { AnimatePresence, motion } from "motion/react";
import type { PaneState } from "../../protocol.ts";
import { useScreen } from "../screen.ts";
import { Term } from "../terminal/Term.tsx";
import { CLOSE, FADE, OPEN, type Rect } from "./transition.ts";

/**
 * The open pane.
 *
 * It is laid out at the screen's size and never resized. What animates is the transform:
 * it starts translated and scaled down so that it sits exactly over the rectangle the
 * closed pane occupied, and ends at identity. Because the layout never changes, the
 * terminal inside is built once, at one grid, and simply appears to get closer.
 *
 * Animating width and height instead — which is what this did first — relayouts the
 * terminal every frame, so opening read as two events (a box growing, then a terminal
 * arriving) rather than one movement.
 *
 * The box itself never fades. It begins exactly where the closed pane was, so it is
 * already in the right place at the right size; only the terminal inside fades up.
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
  const s = useScreen();

  // Where the closed pane sat, expressed as a transform of the screen rectangle.
  const thumbnail = from
    ? { x: from.left - s.left, y: from.top - s.top, scale: from.width / s.width }
    : { x: 0, y: 0, scale: s.scale };

  return (
    <AnimatePresence>
      {pane && from && (
        <>
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
            onClick={onClose}
          />
          <motion.div
            className="pane expanded"
            style={{
              top: s.top,
              left: s.left,
              width: s.width,
              height: s.height,
              transformOrigin: "0 0",
            }}
            initial={thumbnail}
            animate={{ x: 0, y: 0, scale: 1 }}
            exit={{ ...thumbnail, transition: CLOSE }}
            transition={OPEN}
          >
            <motion.div
              className="pane-screen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={FADE}
            >
              <Term id={pane.id} width={s.width} height={s.height} />
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
