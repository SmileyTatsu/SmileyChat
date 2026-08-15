# How to Import Characters

SmileyChat fully supports standard V1, V2, and V3 character cards (like those used in SillyTavern or Text Generation WebUI).

There are three simple ways to bring your characters into SmileyChat:

## Method 1: Drag and Drop (In the App)

1. Open SmileyChat in your browser.
2. Drag any Character PNG or JSON file from your computer.
3. Drop it directly into the SmileyChat window.
4. The app will automatically parse the card, save the image, and add the character to your left sidebar.

## Method 2: The "Imports" Folder

If you want to bulk-import many characters at once, or if you are organizing files via your file explorer:

1. Open your SmileyChat folder.
2. Navigate to `userData/characters/imports/`.
3. Paste all your character PNGs or JSON files into this folder.
4. When you start SmileyChat (or reload the app), it will automatically scan this folder, import all valid characters into your permanent library, and remove the processed files from the `imports` folder.

## Method 3: Local SillyTavern Sync / Migration

If you already have SillyTavern installed locally:

1. Open **Options** from the bottom-left persona bar.
2. Go to **Settings > SillyTavern Sync**.
3. Enter your local SillyTavern installation path (e.g. `C:\Users\...\SillyTavern`).
4. Click **Scan** to discover user folders and asset counts.
5. Select **Characters** (and optionally chats, group chats, personas, presets, or lorebooks).
6. Click **Sync** to import everything directly into your library.

## Where are my characters saved?

Once imported, your characters are securely stored as individual, readable folders inside `userData/characters/library/`. You can easily back them up or edit the JSON files directly.
