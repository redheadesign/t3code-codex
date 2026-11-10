# Design files

Open **Design** from the left navigation to see your files and their previews.
Choose a project when you create a document, or keep it in **Local files**. Drag
a local file onto a project or one of its folders to connect it. Use **Move to
folder** in the file’s menu to do the same without dragging. In Preview, **Open in
Canvas** captures the current screen as a new editable file. Application behavior
stays in the source code.

Design files save automatically on this device, in the browser profile running
T3 Code. You can work without a server. Open the menu beside the document name
and choose **Save a local copy** to download a `.design.json` file with its assets;
use **Open Design file** on another device to
open an independent copy. Keep a downloaded copy before clearing browser data.

**Move file to trash** removes a file from the file list. Restore it through
**Recently deleted**. Deleting a local file does not delete an exported file or a
copy saved in a project.

To share a design with agents, connect it through **Project connection** if it
is still local. Add a description from the document menu and use **Sync** in the
editor. The file card shows **Needs sync** while the latest
changes are local. If another window changes the same local file, save a recovery
copy of your unsaved edits before leaving. If a local write fails, retry it or
download the recovery file.

Copy a file, layer or comment link to reopen it in the same Design library. To
share a reference with a project agent, sync the file and use **Copy reference
for agent**. The reference includes the project file path and the relevant IDs.

Images can be placed one at a time after choosing several files. Click to keep the
original size, drag to resize, or press Escape to cancel placement. Imported
images remain in Assets for reuse. Select an image to adjust Fill, Fit, Crop or
Tile in the Inspector.

**Import > Paste as React** in the document menu accepts JSX or a default React
component. Set the viewport size before importing. Components, expressions and mount effects render once;
the resulting layers and images can then be edited without running the React code.
React and React DOM are included. If the source needs other project dependencies,
capture the running screen through **Open in Canvas** or supply their source files.

Select layers on the canvas or in the layer list, then use `Ctrl+C` and `Ctrl+V`
to copy and paste them. `Ctrl+B` toggles bold on selected text layers. On macOS,
use `⌘` for these shortcuts. Press `Shift+A` to add auto layout to a frame or wrap
selected layers from the same parent in a frame.

Hold `Ctrl` or `⌘` over the canvas to see the outline of the nested layer under
the pointer. Click while holding the key to select that layer.

Use **Scale** (`K`) to resize a selection and its contents proportionally, including
text, strokes and spacing. Drag a selection handle or enter a multiplier or dimension;
the anchor point chooses which part stays in place. Ordinary resize keeps nested
constraints and auto layout in control of the contents.

For playback settings, deselect layers and open **Prototype**. A custom viewport
changes the playback window without resizing your design layers. **Present** runs
the prototype; Escape closes an open overlay first, then returns to the editor.

Use **Add widget** to place a live prototype on the canvas. Paste an HTTP(S)
address or an iframe for a hosted preview, or choose **Code** and enter HTML,
CSS, and JavaScript. The code runner includes Tailwind CSS and exposes `gsap`
and `ScrollTrigger`. Select the widget and choose **Present**, then **Run widget**
to click and scroll inside it. To edit the code, return to the editor and select
**Edit widget**. Code widgets are included in local copies and project sync.
Use a hosted widget for examples that load external assets or libraries.

**Import website** makes editable layers, keeps supported time-based animation
keyframes, and adds reusable candidates from repeated layouts to **Assets**.
If you need the site's own scrolling, scripts, or 3D, choose **Original site**
in Present. When a site blocks embeds or needs a signed-in session, use **Open
original**. Images that could not be copied stay linked to their source. Agents can use the synced design file to find captured component
definitions, or provide HTML, CSS, and JavaScript for a separate code widget.

Right-click a selection and choose **Create component** to reuse it in **Assets**.
Right-click an instance and choose **Detach instance** to edit it independently.
Select a main component and choose **Add variant** to duplicate its layers into
a variant you can edit and insert from **Assets**. On an instance, use **Variant**
to switch between definitions with matching layers and keep your local overrides.
If a variant has different layers, insert it from **Assets** as a new instance.
