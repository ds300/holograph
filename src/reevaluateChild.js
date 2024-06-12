import castInput from "./castInput";

const basePropsKeys = [
  "parentId",
  "id",
  "typeName",
  "type",
  "x",
  "y",
  "rotation",
  "index",
  "opacity",
  "isLocked",
];

const SET_VALUE = Symbol("SET_VALUE");

function evaluateFunction(functionBody, args) {
  let result;
  let error;
  const entries = Object.entries(args);
  try {
    const func = new Function(
      entries.map((a) => a[0]),
      functionBody
    );
    result = func(...entries.map((a) => a[1]));
  } catch (e) {
    error = e;
  }
  return { result, error };
}

/**
 *
 * @param {import('tldraw').Editor} editor
 * @param {import('tldraw').TLShapeId} id
 * @returns
 */
export const reevaluateChild = (editor, id) => {
  console.log("reevaluateChild", id);
  const shape = editor.getShape(id);
  if (
    !shape ||
    shape.type !== "geo" ||
    !(shape.props.geo === "ellipse" || shape.props.geo === "rectangle")
  )
    return;
  const newValues = {};
  const basePropValues = {};
  const customPropValues = {};
  const incomingArrows = editor
    .getBindingsToShape(id, "arrow")
    .filter((binding) => binding.props.terminal === "end")
    .map((binding) => editor.getShape(binding.fromId));

  for (const arrow of incomingArrows) {
    const bindingsFromArrow = editor.getBindingsFromShape(arrow, "arrow");
    const boundShapeId = bindingsFromArrow.filter(
      (binding) => binding.props.terminal === "start"
    )[0]?.toId;
    if (!boundShapeId) continue;
    const inputShape = editor.getShape(boundShapeId);
    if (inputShape.type !== "geo") continue;
    const inputValue =
      inputShape.props.geo === "ellipse"
        ? inputShape.props.text
        : inputShape.meta.$value;
    const label = arrow.props.text || SET_VALUE;
    if (
      typeof label === "string" &&
      label.startsWith('"') &&
      label.endsWith('"')
    ) {
      const propName = label.slice(1, -1);
      if (basePropsKeys.includes(propName)) {
        basePropValues[propName] = castInput(inputValue);
      } else {
        customPropValues[propName] = castInput(inputValue);
      }
    } else {
      newValues[label] = inputValue;
    }
  }

  const nextShape = structuredClone(shape);
  Object.assign(nextShape, basePropValues);
  Object.assign(nextShape.props, customPropValues);
  if (shape.props.geo === "ellipse") {
    if (newValues[SET_VALUE] !== undefined) {
      // update props and set text
      nextShape.props.text = newValues[SET_VALUE];
    }
  } else {
    let functionBody = shape.props.text;
    if (!functionBody.includes("return")) {
      functionBody = `return ${functionBody}`;
    }
    const { result, error } = evaluateFunction(functionBody, newValues);
    if (!error) {
      // Remove quotes or double quotes if they exist
      let resultString =
        JSON.stringify(
          typeof result === "number" ? result.toFixed(2) : result
        ) ?? "";
      if (resultString.startsWith('"') && resultString.endsWith('"')) {
        resultString = resultString.slice(1, -1); // string
      }
      nextShape.meta.$value = resultString;
    } else {
      delete nextShape.meta.$value;
    }
  }
  editor.updateShape(nextShape);
  return;
};
