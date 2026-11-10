# FinFlow — Personal Finance Workspace

A responsive React + Vite app for importing and categorising personal transactions.

## Features
- Upload PDF bank statements, CSV, TXT, and TSV files.
- Extract selectable PDF text in the browser using PDF.js.
- Preview and map statement columns before importing.
- Categorise transactions, create categories, search/filter, review summaries, and export CSV.
- Save transactions, categories, and currency in browser localStorage.

## Run locally
Requires Node.js 18+.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Publish as a phone-accessible website
This project is ready for static hosting (Netlify, Vercel, or similar).

### Netlify using GitHub
1. Extract this ZIP.
2. Create a GitHub repository and upload the project files, including `package.json`, `index.html`, and `src/`.
3. In Netlify, choose **Add new site → Import an existing project** and connect that repository.
4. Set **Build command** to `npm run build` and **Publish directory** to `dist`.
5. Deploy. Netlify will provide an HTTPS website address.
6. Open that address in Chrome on Android, tap the three-dot menu, then **Add to Home screen** (or **Install app**, if offered).

## PDF limitations
- Text-based PDFs with selectable text can be extracted in the browser.
- Scanned/image-only PDFs need OCR and are not automatically readable by this version. Export those statements as CSV from the bank if available.
- Bank statement layouts vary. Always inspect the import preview and verify dates, descriptions, and amounts before confirming.

## Privacy and storage
The app processes imported files in the browser and stores app data in that browser's localStorage. There is no account sync or cloud backup in this version. Do not use a shared/public device. Clearing browser site data can erase saved transactions. Keep a separate backup/export.
