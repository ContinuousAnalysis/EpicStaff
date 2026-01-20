import csv
import fitz
from docx import Document
from io import BytesIO, StringIO
from bs4 import BeautifulSoup
from loguru import logger


def extract_text_from_binary(binary_content: bytes, file_type: str) -> str:
    """
    Universal dispatcher to extract text from binary content based on file type.
    """

    file_type = file_type.lower().lstrip(".")
    try:
        if file_type in ("txt", "md", "json"):
            return extract_text(binary_content)

        elif file_type == "pdf":
            return extract_text_from_pdf(binary_content)

        elif file_type == "csv":
            return extract_text_from_csv(binary_content)

        elif file_type == "docx":
            return extract_text_from_docx(binary_content)

        elif file_type == "html":
            return extract_text_from_html(binary_content)

        else:
            raise ValueError(f"Unsupported file type: {file_type}")

    except Exception as e:
        logger.error(f"Failed to extract text from {file_type} file: {e}")
        raise


def extract_text(binary_content: bytes) -> str:
    """Extract text from plain text files"""

    try:
        return binary_content.decode("utf-8")
    except UnicodeDecodeError:
        logger.warning("UTF-8 decode failed, trying latin-1")
        return binary_content.decode("latin-1")


def _is_valid_pdf(binary_content: bytes) -> bool:
    """
    Check if binary content is a valid PDF by looking for the PDF magic bytes.
    PDF files should start with '%PDF-' (possibly with leading whitespace).
    """
    # Strip leading whitespace and check for PDF signature
    content = binary_content.lstrip()
    return content.startswith(b"%PDF-")


def extract_text_from_pdf(binary_content: bytes) -> str:
    """
    Extract text from PDF files.
    Falls back to plain text extraction if the content is not a valid PDF.
    """

    # Check if content is actually a valid PDF
    if not _is_valid_pdf(binary_content):
        logger.warning(
            "Content has .pdf extension but is not a valid PDF file. "
            "Attempting plain text extraction."
        )
        return extract_text(binary_content)

    text_parts = []
    try:
        pdf_document = fitz.open(stream=binary_content, filetype="pdf")

        for page_num in range(pdf_document.page_count):
            page = pdf_document[page_num]
            page_text = page.get_text("text")

            if page_text.strip():
                text_parts.append(page_text.strip())

        pdf_document.close()

        if not text_parts:
            logger.warning("No text extracted from PDF")
            return ""

        return "\n\n".join(text_parts)

    except Exception as e:
        logger.error(f"PDF text extraction failed: {e}")
        raise


def extract_text_from_csv(binary_content: bytes) -> str:
    """
    Extract text from CSV files.
    """

    try:
        text_content = binary_content.decode("utf-8")
        csv_file = StringIO(text_content)

        delimiter = ","
        reader = csv.reader(csv_file, delimiter=delimiter)

        extracted_rows = []
        for row in reader:
            if row and len(row[0].replace(delimiter, "")) != 0:
                extracted_rows.append(",".join(row))

        return "\n".join(extracted_rows)

    except Exception as e:
        logger.error(f"CSV text extraction failed: {e}")
        raise




def extract_text_from_docx(binary_content: bytes) -> str:
    """
    Extract text from DOCX files using python-docx.
    """

    try:
        docx_file = BytesIO(binary_content)
        document = Document(docx_file)

        paragraphs = [p.text for p in document.paragraphs if p.text.strip()]

        if not paragraphs:
            logger.warning("No text extracted from DOCX")
            return ""

        return "\n".join(paragraphs)

    except Exception as e:
        logger.error(f"DOCX text extraction failed: {e}")
        raise


def extract_text_from_html(binary_content: bytes) -> str:
    """
    Extract text from HTML files using BeautifulSoup.
    Removes scripts, styles, and images, keeping only text content.
    """

    try:
        html_content = binary_content.decode("utf-8")
        soup = BeautifulSoup(html_content, "html.parser")

        # Remove unwanted tags
        for tag in soup(["script", "style", "img"]):
            tag.decompose()

        # Return cleaned HTML
        return str(soup)

    except Exception as e:
        logger.error(f"HTML text extraction failed: {e}")
        raise
