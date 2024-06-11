import "./index.css";
import "./App.css";

import { useCallback, useEffect, useState } from "react";
import { Tldraw, loadSnapshot } from "tldraw";
import castInput from "./castInput";
import deepDiff from "./deepDiff";
import getUniqueName from "./getUniqueName";
import CustomHelpMenu from "./CustomHelpMenu";
import CustomMainMenu from "./CustomMainMenu";
import SharePanel from "./SharePanel";
import { Analytics } from "@vercel/analytics/react";

// TODO: fractions lol

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

export default function StoreEventsExample() {
  const [editor, setEditor] = useState();

  const getCellValues = (editor) =>
    editor.store.allRecords().reduce((acc, record) => {
      if (record.type === "geo" && record?.props?.geo === "ellipse") {
        acc[record.id] = record.props.text;
      }
      return acc;
    }, {});

  const getObjects = (editor) => {
    let propagators = [];
    let arrows = [];
    let cells = [];
    editor.store.allRecords().forEach((record) => {
      const { type, typeName, props } = record;
      if (typeName === "shape")
        if (type === "arrow") {
          arrows.push(record);
        } else if (type === "geo") {
          // eslint-disable-next-line react/prop-types
          const { geo } = props;
          if (geo === "rectangle") {
            propagators.push(record);
          } else if (geo === "ellipse") {
            cells.push(record);
          }
        }
    });

    return { propagators, arrows, cells };
  };

  const getIsFirstVisit = () => {
    if (!localStorage.getItem("visited")) {
      localStorage.setItem("visited", "true");
      return true;
    } else {
      return false;
    }
  };

  const setAppToState = useCallback((editor) => {
    setEditor(editor);
  }, []);

  const propagate = (id) => {
    let cellValues = getCellValues(editor);
    let { propagators, arrows, cells } = getObjects(editor);

    // Get input and output cells
    let inputCells = [];
    let outputCells = [];
    let usedNames = [];
    arrows.forEach((arrow) => {
      const { start, end, text } = arrow.props;
      if (end.boundShapeId === id) {
        const cellId = start.boundShapeId;
        let inputCell = cells.find((cell) => cell.id === cellId);
        if (inputCell) {
          const variableName = text || getUniqueName(usedNames);
          let modifiedInputCell = { ...inputCell, variableName };
          inputCells.push(modifiedInputCell);
          usedNames.push(variableName);
        }
      } else if (start.boundShapeId === id) {
        const cellId = end.boundShapeId;
        let outputCell = cells.find((cell) => cell.id === cellId);
        if (outputCell) {
          let modifiedOutputCell = { ...outputCell, variableName: text };
          outputCells.push(modifiedOutputCell);
        }
      }
    });

    // Get new values & props from input cells
    let newValues = {};
    let newProps = {};
    let error;
    inputCells.forEach((inputCell) => {
      const { props, variableName } = inputCell;

      if (
        // variableName !== undefined &&
        variableName.startsWith('"') &&
        variableName.endsWith('"')
      ) {
        // eslint-disable-next-line react/prop-types
        newProps[variableName.slice(1, -1)] = castInput(props.text);
      } else {
        // eslint-disable-next-line react/prop-types
        newValues[variableName] = props.text;
      }
    });

    // Update object with new props
    if (Object.keys(newProps).length > 0) {
      // Split newprops into baseProps and customProps
      let baseProps = {};
      let customProps = {};
      Object.entries(newProps).forEach(([key, value]) => {
        if (basePropsKeys.includes(key)) {
          baseProps[key] = value;
        } else {
          customProps[key] = value;
        }
      });

      editor.store.update(id, (record) => ({
        id,
        ...record,
        ...baseProps,
        props: { ...record.props, ...customProps },
      }));
    }

    // Run the function with new values
    const argumentNames = Object.keys(newValues);
    const argumentValues = Object.values(newValues).map((value) =>
      castInput(value)
    );
    let propagator = propagators.find((prop) => prop.id === id);

    // if (!propagator?.props?.text?.includes(".")) {
    //   console.log(propagator?.id, propagator?.props.text);
    // }

    if (!propagator) return; // Unattached arrow
    let functionBody = propagator.props.text;
    if (!functionBody.includes("return")) {
      functionBody = `return ${functionBody}`;
    }
    let result;
    try {
      const func = new Function(argumentNames, functionBody);
      result = func(...argumentValues);
    } catch (error) {
      // console.error(error);
    }

    if (result !== undefined && !error) {
      // Queue up updates to cells
      outputCells.forEach((outputCell) => {
        const { id } = outputCell;

        if (typeof result === "number") {
          result = parseFloat(result.toFixed(2));
        }

        // Remove quotes or double quotes if they exist
        let resultString = JSON.stringify(result);
        if (resultString.startsWith('"') && resultString.endsWith('"')) {
          resultString = resultString.slice(1, -1); // string
        }

        // Update cell if the result is different
        // eslint-disable-next-line react/prop-types
        if (resultString !== cellValues[id]) {
          editor.store.update(outputCell.id, (record) => ({
            id,
            ...record,
            props: { ...record.props, text: resultString },
          }));
        }
      });
    }
  };

  // Load tutorial to current page if its empty and its the first load
  useEffect(() => {
    if (!editor) return;
    window.editor = editor;
    const allRecords = editor.store.allRecords();
    const canvasRecords = allRecords.filter(
      ({ id }) => id.startsWith("shape") || id.startsWith("asset")
    );
    if (canvasRecords.length === 0 && getIsFirstVisit()) {
      fetch("/tutorial.json")
        .then((response) => {
          if (response.ok) return response.json();
        })
        .then((tutorial) => {
          loadSnapshot(editor.store, tutorial);
        });
      // .catch((error) => console.error(error));
    }
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    //[1]
    const handleChangeEvent = (change) => {
      // Added
      for (const record of Object.values(change.changes.added)) {
        if (record.typeName === "shape") {
          // console.log(`created shape (${JSON.stringify(record)})\n`);
        }
      }

      // Updated
      for (const [from, to] of Object.values(change.changes.updated)) {
        if (from.id.startsWith("shape") && to.id.startsWith("shape")) {
          let diff = deepDiff(from, to);

          // Updated cell text
          if (to?.props?.geo === "ellipse" && diff["props.text"]) {
            const propagatorIdsToUpdate = editor.store
              .allRecords()
              .filter(
                (record) =>
                  record.type === "arrow" &&
                  record.props.start.boundShapeId === to.id
              )
              .map((record) => record.props.end.boundShapeId);
            propagatorIdsToUpdate.forEach((id) => {
              propagate(id);
            });
          }

          // Debugging
          // if (diff["x"] || diff["y"]) console.log("moved shape: ", to);

          // Updated propagator code
          if (to?.props?.geo === "rectangle" && diff["props.text"]) {
            propagate(to.id);
          }

          // Updated arrow connection
          if (to.type === "arrow") {
            let newStart =
              diff["props.start.boundShapeId"] && to.props.end.boundShapeId;
            let newEnd =
              diff["props.end.boundShapeId"] && to.props.start.boundShapeId;
            if (newStart || newEnd) {
              editor.store.allRecords().forEach((record) => {
                if (record?.props?.geo === "rectangle") {
                  if (record.id === to.props.end.boundShapeId) {
                    propagate(record.id);
                  }
                  if (record.id === to.props.start.boundShapeId) {
                    propagate(record.id);
                  }
                }
              });
            }
          }

          // Updated arrow text
          if (
            to.type === "arrow" &&
            diff["props.text"] &&
            to.props.end.boundShapeId
          ) {
            editor.store.allRecords().forEach((record) => {
              if (record?.props?.geo === "rectangle") {
                if (record.id === to.props.end.boundShapeId) {
                  propagate(record.id);
                }
              }
            });
          }
        }
      }

      // Removed
      for (const record of Object.values(change.changes.removed)) {
        if (record.typeName === "shape") {
          // console.log(`deleted shape (${record.type})\n`);
          // propagate();
        }
      }
    };

    // [2]
    const cleanupFunction = editor.store.listen(handleChangeEvent, {
      source: "user",
      scope: "all",
    });

    return () => {
      cleanupFunction();
    };
  }, [editor]);

  const components = {
    HelpMenu: CustomHelpMenu,
    MainMenu: (...props) => <CustomMainMenu {...props} editor={editor} />,
    SharePanel,
  };

  return (
    <div style={{ display: "flex", width: "100%" }}>
      <Tldraw
        onMount={setAppToState}
        persistenceKey="holograph-1"
        components={components}
      />
      <Analytics />
    </div>
  );
}
