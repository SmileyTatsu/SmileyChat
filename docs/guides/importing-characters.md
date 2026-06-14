# How to Import Characters

SmileyChat fully supports standard V1, V2, and V3 character cards (like those used in SillyTavern or Text Generation WebUI).

There are two simple ways to bring your characters into SmileyChat:

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

## Where are my characters saved?

Once imported, your characters are securely stored as individual, readable folders inside `userData/characters/library/`. You can easily back them up or edit the JSON files directly.
