import "./index.css";
import "./App.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DefaultContextMenuContent,
  TldrawEditor,
  TldrawUi,
  defaultShapeTools,
  defaultShapeUtils,
  defaultTools,
  loadSnapshot,
  ContextMenu,
} from "tldraw";
import CustomHelpMenu from "./CustomHelpMenu";
import CustomMainMenu from "./CustomMainMenu";
import SharePanel from "./SharePanel";
import { CustomArrowBindingUtil } from "./CustomArrowBindingUtil";

// TODO: fractions lol

export default function StoreEventsExample() {
  const [editor, setEditor] = useState();

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

  const components = useMemo(
    () => ({
      HelpMenu: CustomHelpMenu,
      MainMenu: (...props) => <CustomMainMenu {...props} editor={editor} />,
      SharePanel,
    }),
    []
  );

  return (
    <div style={{ display: "flex", width: "100%" }}>
      <TldrawEditor
        onMount={setAppToState}
        initialState="select"
        shapeUtils={defaultShapeUtils}
        bindingUtils={useMemo(() => [CustomArrowBindingUtil], [])}
        tools={useMemo(() => [...defaultTools, ...defaultShapeTools], [])}
        components={components}
        persistenceKey="holograph-1"
      >
        <TldrawUi>
          <ContextMenu>
            <DefaultContextMenuContent />
          </ContextMenu>
        </TldrawUi>
      </TldrawEditor>
      {/* <Analytics /> */}
    </div>
  );
}
