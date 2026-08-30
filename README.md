# PDF Binnyash

A lightweight, privacy-focused PDF workspace for Windows.

**PDF Binnyash** is a local-first desktop application designed to make PDF preparation, modification, and printing easier. It is specially optimized for **class slide and note printing**. It provides a simple workflow for merging documents, modifying page colors, and creating custom print layouts — all processed locally on your computer.

No account, cloud upload, or web server is required.

## Features

### PDF Merge

* Import multiple PDF files using file browsing or drag and drop
* Arrange PDFs manually with drag and drop
* Move files up or down in the list
* Remove individual files
* Sort files using:

  * Original order
  * A–Z
  * Z–A
* Natural numerical sorting (`1.pdf`, `2.pdf`, `10.pdf`)
* Merge PDFs into a single document

### Color Modification

Modify the appearance of PDF pages with:

* Color inversion
* Grayscale conversion
* Contrast adjustment
* Sharpening
* Threshold adjustment
* Live page previews
* Page-by-page preview navigation

Color modifications are applied to the complete PDF when the result is processed.

### Print Layout

Create custom print-ready PDF layouts from your document.

Supported paper sizes:

* A0
* A1
* A2
* A3
* A4
* A5
* A6
* B4
* B5
* Letter
* Legal
* Tabloid
* Executive
* Statement

Additional options include:

* Portrait and landscape orientation
* Custom rows and columns
* Column-major page placement
* Automatic page fitting while preserving aspect ratio
* Print-layout preview
* Source-page numbering
* Print-layout watermark

### Workflow

PDF Binnyash is designed around a simple workflow:

```text
Import PDFs
    ↓
Arrange / Merge
    ↓
Download or Proceed
    ↓
Color Modification
    ↓
Download or Proceed
    ↓
Print Layout
    ↓
Download
```

### Download vs Proceed

**Download** creates a copy of the current result and opens the normal Windows Save dialog. It does not advance the current workflow.

**Proceed** processes the current stage and immediately moves the resulting PDF to the next stage without opening a Save dialog.

This makes it possible to either save an intermediate result or continue directly through the workflow.

## Privacy

Your files stay on your computer.

PDF Binnyash performs its PDF processing locally using Python. Your documents are not uploaded to a remote server for processing.

Once installed, the application can be used offline.

## Download

Download the latest Windows executable from the **Releases** section of this repository.

The packaged application does not require Python or any additional dependencies to be installed.

## Run From Source

### Requirements

* Windows
* Python 3.10 or newer

Clone the repository and run:

```bat
run.bat
```

Or manually:

```bat
py -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
python app.py
```

## Build the Windows EXE

Make sure Python and the project dependencies are installed, then run:

```bat
build.bat
```

The build script uses PyInstaller to create a standalone Windows executable.

The resulting file will be:

```text
dist/PDF Binnyash.exe
```

## Project Structure

```text
PDF-Binnyash/
├── assets/
│   └── windows.ico
├── backend/
│   ├── __init__.py
│   ├── pdf_color.py
│   ├── pdf_merge.py
│   └── pdf_print.py
├── frontend/
│   ├── index.html
│   ├── script.js
│   └── style.css
├── app.py
├── build.bat
├── run.bat
├── requirements.txt
├── LICENSE
└── README.md
```

## Built With

* Python
* PyWebView
* PyMuPDF
* Pillow
* PyInstaller
* HTML
* CSS
* JavaScript

## License

PDF Binnyash is licensed under the MIT License.

See the `LICENSE` file for the full license text.
