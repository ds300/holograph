import { defaultBindingUtils } from "tldraw";
import { reevaluateChild } from "./reevaluateChild";
import getUniqueName from "./getUniqueName";

const [ArrowBindingUtil] = defaultBindingUtils;

export class CustomArrowBindingUtil extends ArrowBindingUtil {
  evaluateOnTickNodes = new Set();
  constructor(...args) {
    super(...args);
    this.editor.on("tick", () => {
      for (const id of this.evaluateOnTickNodes) {
        for (const { fromId } of this.editor.getBindingsToShape(id, "arrow")) {
          if (this.editor.getBindingsInvolvingShape(fromId).length > 1) {
            // if there is at least one arrow going out of the shape and into another shape,
            // then we can reevaluate the child.
            reevaluateChild(this.editor, id);
            return;
          }
        }
      }
    });
    const isDashedRectangle = (shape) =>
      shape.typeName === "shape" &&
      shape.type === "geo" &&
      shape.props.geo === "rectangle" &&
      shape.props.dash === "dashed";
    this.evaluateOnTickNodes = new Set(
      this.editor.store
        .allRecords()
        .filter(isDashedRectangle)
        .map((r) => r.id)
    );
    this.editor.store.listen(
      (change) => {
        // Added
        for (const record of Object.values(change.changes.added)) {
          if (record.typeName === "shape") {
            if (isDashedRectangle(record)) {
              this.evaluateOnTickNodes.add(record.id);
            }
          }
        }

        // Updated
        for (const [from, to] of Object.values(change.changes.updated)) {
          if (isDashedRectangle(to)) {
            this.evaluateOnTickNodes.add(to.id);
          } else if (isDashedRectangle(from)) {
            this.evaluateOnTickNodes.delete(from.id);
          }
        }

        // Removed
        for (const record of Object.values(change.changes.removed)) {
          this.evaluateOnTickNodes.delete(record.id);
        }
      },
      { source: "all" }
    );
  }
  onAfterCreate({ binding }) {
    super.onAfterCreate?.({ binding });
    if (binding.props.terminal === "end") {
      // add a variable name if needed
      const toShape = this.editor.getShape(binding.toId);
      if (toShape.type === "geo" && toShape.props.geo === "rectangle") {
        const arrow = this.editor.getShape(binding.fromId);
        const startBinding = this.editor
          .getBindingsFromShape(arrow, "arrow")
          .find((b) => b.props.terminal === "start");
        if (startBinding?.toId === binding.toId) {
          // if the arrow starts and ends on the same shape, don't add a variable name
        } else if (!arrow.props.text) {
          const allLabels = this.editor
            .getBindingsInvolvingShape(toShape, "arrow")
            .filter((ab) => ab.props.terminal === "end")
            .map((ab) => this.editor.getShape(ab.fromId))
            .map((ab) => ab.props.text);
          this.editor.updateShape({
            ...arrow,
            props: {
              ...arrow.props,
              text: getUniqueName(allLabels),
            },
          });
        }
      }
      reevaluateChild(this.editor, binding.toId);
    }
  }
  onAfterDelete({ binding }) {
    super.onAfterDelete?.({ binding });
    if (binding.props.terminal === "end") {
      reevaluateChild(this.editor, binding.toId);
    }
  }
  // the bound shape changed
  onAfterChangeToShape({ shapeBefore, shapeAfter, binding }) {
    super.onAfterChangeToShape?.({ shapeBefore, shapeAfter, binding });
    if (binding.props.terminal !== "start") return;
    if (shapeAfter.type !== "geo") return;
    if (
      shapeAfter.props.geo === "rectangle" &&
      shapeBefore.props.text !== shapeAfter.props.text
    ) {
      reevaluateChild(this.editor, binding.toId);
      // if the value updates this callback will be triggered again
      // so we can return early (or rather, actually, late?)
      return;
    }
    const endTerminalBinding = this.editor
      .getBindingsInvolvingShape(binding.fromId)
      .find((b) => b.props.terminal === "end");
    if (!endTerminalBinding) return;
    reevaluateChild(this.editor, endTerminalBinding.toId);
  }
  // the arrow itself changed
  onAfterChangeFromShape({ shapeBefore, shapeAfter, binding }) {
    super.onAfterChangeFromShape({ shapeBefore, shapeAfter, binding });
    if (shapeBefore.props.text !== shapeAfter.props.text) {
      reevaluateChild(this.editor, binding.toId);
    }
  }
}
