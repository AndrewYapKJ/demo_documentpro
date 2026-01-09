# -*- encoding: utf-8 -*-
"""
OpenAI Document Extraction Service
"""

import os
import base64
import json
import io
import fitz 
try:
    from openai import OpenAI
    import logging
    logger = logging.getLogger(__name__)
    logger.info("OpenAI package imported successfully")
except ImportError as e:
    logger = logging.getLogger(__name__)
    logger.exception("Error importing OpenAI: %s", e)
    OpenAI = None

try:
    from pdf2image import convert_from_bytes
    from PIL import Image
    logger.info("PDF conversion libraries imported successfully")
    PDF_CONVERSION_AVAILABLE = True
except ImportError as e:
    logger.exception("PDF conversion libraries not available: %s", e)
    PDF_CONVERSION_AVAILABLE = False

from typing import Dict, Any, Optional


class DocumentExtractionService:
   
    
    def __init__(self, api_key: Optional[str] = None):
        if OpenAI is None:
            logger.error("OpenAI package not available")
            self.client = None
            return
            
        self.api_key = api_key or os.getenv('OPENAI_API_KEY')
        if not self.api_key:
            logger.warning("No OpenAI API key provided.")
            self.client = None
        else:
            try:
                logger.info("Initializing OpenAI client with API key: %s...", self.api_key[:10])
            
                self.client = OpenAI(
                    api_key=self.api_key
                )
                logger.info("OpenAI client initialized successfully")
            except Exception as e:
                logger.exception("Error initializing OpenAI client: %s", e)
             
                self.client = None
    
    def _convert_pdf_to_image(self, file_bytes: bytes, max_pages: int = None) -> tuple[bytes, str]:
        """
        Convert PDF bytes to image bytes (all pages or specified max)2
        
        Args:
            file_bytes: PDF file content as bytes
            max_pages: Maximum number of pages to convert (None = all pages)
            
        Returns:
            Tuple of (image_bytes, mime_type)
        """
        if not PDF_CONVERSION_AVAILABLE:
            raise Exception("PDF conversion libraries not available")
        
        try:
            # Convert all pages (or up to max_pages)
            logger.info("Converting PDF to images (max_pages: %s)", max_pages or "all")
            
            if max_pages:
                images = convert_from_bytes(file_bytes, first_page=1, last_page=max_pages, dpi=200)
            else:
                images = convert_from_bytes(file_bytes, dpi=200)
            
            if not images:
                raise Exception("No pages found in PDF")
            
            num_pages = len(images)
            logger.info("Converted %d page(s) from PDF", num_pages)
            
         
            if num_pages == 1:
                img_buffer = io.BytesIO()
                images[0].save(img_buffer, format='PNG')
                img_bytes = img_buffer.getvalue()
                logger.info("Single page PDF converted to PNG (%d bytes)", len(img_bytes))
                return img_bytes, "image/png"
            
            
            logger.info("Merging %d pages vertically...", num_pages)
            
     
            widths = [img.width for img in images]
            heights = [img.height for img in images]
     
            max_width = max(widths)
            total_height = sum(heights)
            
          
            merged_image = Image.new('RGB', (max_width, total_height), 'white')
            
          
            y_offset = 0
            for img in images:
              
                x_offset = (max_width - img.width) // 2
                merged_image.paste(img, (x_offset, y_offset))
                y_offset += img.height
            
         
            img_buffer = io.BytesIO()
            merged_image.save(img_buffer, format='PNG')
            img_bytes = img_buffer.getvalue()
            
            logger.info("Successfully merged %d pages into single PNG (%d bytes, %dx%d)", 
                       num_pages, len(img_bytes), max_width, total_height)
            return img_bytes, "image/png"
            
        except Exception as e:
            logger.exception("Error converting PDF to image: %s", e)
            raise Exception(f"Failed to convert PDF: {str(e)}")
    
    def _detect_file_type(self, file_bytes: bytes) -> str:
        """
        Detect file type from file bytes
        
        Args:
            file_bytes: File content as bytes
            
        Returns:
            File type string
        """
     
        if file_bytes.startswith(b'%PDF'):
            return 'pdf'
        
        
        if file_bytes.startswith(b'\xff\xd8\xff'):
            return 'jpeg'
        elif file_bytes.startswith(b'\x89PNG'):
            return 'png'
        elif file_bytes.startswith(b'GIF'):
            return 'gif'
        elif file_bytes.startswith(b'RIFF') and b'WEBP' in file_bytes[:12]:
            return 'webp'
        
       
        return 'unknown'
    
    def _prepare_image_for_api(self, file_bytes: bytes) -> tuple[str, str]:
     
        file_type = self._detect_file_type(file_bytes)
        logger.debug("Detected file type: %s", file_type)
        
        if file_type == 'pdf':
            if not PDF_CONVERSION_AVAILABLE:
                raise Exception("PDF files are not supported - PDF conversion libraries not available")
            
          
            image_bytes, mime_type = self._convert_pdf_to_image(file_bytes)
            file_b64 = base64.b64encode(image_bytes).decode("utf-8")
            return file_b64, mime_type
            
        elif file_type in ['jpeg', 'png', 'gif', 'webp']:
          
            mime_type = f"image/{file_type}"
            file_b64 = base64.b64encode(file_bytes).decode("utf-8")
            return file_b64, mime_type
            
        else:
         
            logger.info("Unknown file type, attempting as JPEG...")
            mime_type = "image/jpeg"
            file_b64 = base64.b64encode(file_bytes).decode("utf-8")
            return file_b64, mime_type
    def _extract_text_from_pdf(self, pdf_bytes: bytes):
        """Extract all text from the PDF and return as a single string"""
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text()
        return text
        
    def extract_from_file(self, file_bytes: bytes, schema: Dict[str, Any]) -> Dict[str, Any]:
      
      
        
        try:
         
            file_b64, mime_type = self._prepare_image_for_api(file_bytes)
         
          
            extraction_schema = self._build_extraction_schema(schema)
            
            response = self.client.chat.completions.create(
                model="gpt-4.1-mini",  
              messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a document extraction engine. "
                            "Extract data strictly following the given JSON schema. "
                            "Do not add extra fields. Do not add explanations. "
                            "Return only valid JSON. "
                            "If a field is not found in the document, use null. "
                            "For table fields, return an array of objects even if empty. "
                            "IMPORTANT: Some field descriptions contain [POSITION: ...] information "
                            "indicating specific areas in the document to focus on. "
                            "Use these position hints to extract data from the precise locations specified. "
                            "Position coordinates are given as percentages from the document edges or absolute pixels."
                        )
                    },
                    {
                        "role": "user",
                        "content": [
                                    {
                                        "type": "text",
                                        "text": f"Extract document data and return JSON with this exact schema: {json.dumps(extraction_schema)}"
                                    },
                                    {
                                        "type": "image_url",
                                        "image_url": {
                                            "url": f"data:{mime_type};base64,{file_b64}"
                                        }
                                    }
                                    # {
                                    #     "type": "text",
                                    #     "text": f"Here is the full document text:\n{full_text}"
                                    # }                                    
                                ]
                    }
                    
                    
                ],
                response_format={"type": "json_object"}  # ensures valid JSON
            )
            
          
            extracted_data = json.loads(response.choices[0].message.content)
            logger.info("OpenAI extraction successful: %s", extracted_data)
            
      
            return self._format_extraction_results(extracted_data, schema)
   
            
        except json.JSONDecodeError as e:
            logger.exception("JSON parsing error in OpenAI response: %s", e)
            logger.debug("Raw response: %s", response.choices[0].message.content)
            raise e

            
        except Exception as e:
            logger.exception("Error in OpenAI extraction: %s", e)
            logger.debug("Error type: %s", type(e).__name__)
            raise e


    
    def _build_extraction_schema(self, form_schema: Dict[str, Any]) -> Dict[str, Any]:
        """Build OpenAI extraction schema from form schema with position information"""
        extraction_schema = {}
        
   
        doc_metadata = form_schema.get('documentMetadata', {})
        pdf_info = doc_metadata.get('pdfInfo') or {}
        num_pages = pdf_info.get('numPages', 1)
        
        if num_pages > 1:
            logger.info("Building extraction schema for %d-page document", num_pages)
        
        for field in form_schema.get('fields', []):
            field_name = field.get('name', '')
            field_type = field.get('type', 'text')
            description = field.get('description', '')
            position = field.get('position', {})
            
          
            enhanced_description = self._build_field_description_with_position(
                field_name, description, position
            )
            
            if field_type == 'table':
               
                subfields = {}
                for subfield in field.get('subfields', []):
                    subfield_name = subfield.get('name', '')
                    subfield_type = subfield.get('type', 'text')
                    
                    if subfield_type == 'number':
                        subfields[subfield_name] = "number"
                    elif subfield_type == 'date':
                        subfields[subfield_name] = "YYYY-MM-DD"
                    else:
                        subfields[subfield_name] = "string"
                
            
                extraction_schema[field_name] = {
                    "type": "array",
                    "description": enhanced_description,
                    "items": subfields
                }
            elif field_type == 'number':
                extraction_schema[field_name] = {
                    "type": "number",
                    "description": enhanced_description
                }
      
            elif field_type == 'boolean':
                extraction_schema[field_name] = {
                    "type": "boolean",
                    "description": enhanced_description
                }
            else:
                extraction_schema[field_name] = {
                    "type": "string", 
                    "description": enhanced_description
                }
        
        return extraction_schema

    def _build_field_description_with_position(self, field_name: str, description: str, position: Dict[str, Any]) -> str:
        """Build enhanced field description including position information for OpenAI"""
        base_desc = description or f"Extract {field_name}"
        
        # Check if position data is available
        if not position or not position.get('rect'):
            return base_desc
        
        rect = position.get('rect', {})
        coords = position.get('coordinates', {})
        scale = position.get('scale', 1)
        canvas_dims = position.get('canvasDimensions', {})
        page_num = position.get('pageNumber', 1)
        
        # Build position description
        position_desc = f" [POSITION: Look specifically in the document area at coordinates "
        
        if rect:
            # Convert canvas coordinates to relative positions (percentages)
            canvas_width = canvas_dims.get('displayWidth', canvas_dims.get('width', 1))
            canvas_height = canvas_dims.get('displayHeight', canvas_dims.get('height', 1))
            
            if canvas_width > 0 and canvas_height > 0:
                x_percent = (rect.get('x', 0) / canvas_width) * 100
                y_percent = (rect.get('y', 0) / canvas_height) * 100
                width_percent = (rect.get('width', 0) / canvas_width) * 100
                height_percent = (rect.get('height', 0) / canvas_height) * 100
                
                position_desc += f"approximately {x_percent:.1f}% from left, {y_percent:.1f}% from top, "
                position_desc += f"spanning {width_percent:.1f}% width and {height_percent:.1f}% height"
            else:
                position_desc += f"x:{rect.get('x', 0)}, y:{rect.get('y', 0)}, "
                position_desc += f"width:{rect.get('width', 0)}, height:{rect.get('height', 0)}"
        
        if page_num > 1:
            position_desc += f" on page {page_num}"
            
        position_desc += "]"
        
        return base_desc + position_desc
    
    def _format_extraction_results(self, extracted_data: Dict[str, Any], form_schema: Dict[str, Any]) -> Dict[str, Any]:
        """Format extraction results to match UI expectations"""
        results = {}
        
        for field in form_schema.get('fields', []):
            field_name = field.get('name', '')
            field_type = field.get('type', 'text')
            
            if field_name in extracted_data:
                value = extracted_data[field_name]
                
                if field_type == 'table':
                    # Ensure table data is properly formatted as array
                    if isinstance(value, list):
                        results[field_name] = value
                    elif value is None:
                        results[field_name] = []
                    else:
                        # Try to convert to array format
                        results[field_name] = [value] if value else []
                elif field_type == 'number':
                    # Ensure numeric values are properly converted
                    try:
                        results[field_name] = float(value) if value is not None else None
                    except (ValueError, TypeError):
                        results[field_name] = None
                else:
                    results[field_name] = value
            else:
                # Field not found in extraction, set appropriate default
                if field_type == 'table':
                    results[field_name] = []
                else:
                    results[field_name] = None
        
        return results
    
