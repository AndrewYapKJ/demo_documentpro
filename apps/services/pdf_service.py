"""
PDF Service for handling PDF operations
Converts PDF pages to images for viewport selection
"""

import os
import base64
import io
from PIL import Image
import logging

logger = logging.getLogger(__name__)
import pdf2image
import tempfile
from flask import url_for


class PDFService:
    def __init__(self):
        self.temp_dir = tempfile.gettempdir()
        self.static_dir = 'apps/static/uploads'
        self.ensure_upload_dir()
    
    def ensure_upload_dir(self):
        """Ensure the upload directory exists"""
        os.makedirs(self.static_dir, exist_ok=True)
    
    def convert_page_to_image(self, pdf_path, page_num=0, dpi=200):
        """
        Convert a specific PDF page to an image
        
        Args:
            pdf_path (str): Path to the PDF file
            page_num (int): Page number to convert (0-indexed)
            dpi (int): DPI for the conversion
            
        Returns:
            dict: Result with image_url and metadata
        """
        try:
            # Convert PDF pages to images
            pages = pdf2image.convert_from_path(
                pdf_path,
                dpi=dpi,
                first_page=page_num + 1,
                last_page=page_num + 1,
                fmt='PNG'
            )
            
            if not pages:
                return {'error': 'Failed to convert PDF page'}
            
            # Get the converted page
            page_image = pages[0]
            
            # Get total page count
            try:
                all_pages = pdf2image.convert_from_path(pdf_path, dpi=100)
                page_count = len(all_pages)
            except Exception:
                page_count = 1
            
            # Save image to static directory
            import uuid
            filename = f"pdf_page_{uuid.uuid4().hex}.png"
            image_path = os.path.join(self.static_dir, filename)
            
            # Resize to target dimensions while maintaining aspect ratio
            target_width = 595
            target_height = 842
            
            # Calculate dimensions
            img_width, img_height = page_image.size
            
            # Scale to fit within target dimensions
            scale_width = target_width / img_width
            scale_height = target_height / img_height
            scale = min(scale_width, scale_height)
            
            new_width = int(img_width * scale)
            new_height = int(img_height * scale)
            
            # Resize the image
            resized_image = page_image.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            # Create a white background of target size
            final_image = Image.new('RGB', (target_width, target_height), 'white')
            
            # Center the resized image
            paste_x = (target_width - new_width) // 2
            paste_y = (target_height - new_height) // 2
            final_image.paste(resized_image, (paste_x, paste_y))
            
            # Save the final image
            final_image.save(image_path, 'PNG', quality=95)
            
            # Generate URL for the image
            image_url = url_for('static', filename=f'uploads/{filename}')
            
            return {
                'image_url': image_url,
                'page_count': page_count,
                'pdf_width': img_width,
                'pdf_height': img_height,
                'target_width': target_width,
                'target_height': target_height,
                'paste_x': paste_x,
                'paste_y': paste_y,
                'scale': scale
            }
            
        except Exception as e:
            logger.exception("PDF conversion error: %s", e)
            return {'error': f'PDF conversion failed: {str(e)}'}
    
    def convert_all_pages(self, pdf_path, dpi=150):
        """
        Convert all PDF pages to images
        
        Args:
            pdf_path (str): Path to the PDF file
            dpi (int): DPI for the conversion
            
        Returns:
            dict: Result with list of image URLs and metadata
        """
        try:
            # Convert all PDF pages to images
            pages = pdf2image.convert_from_path(pdf_path, dpi=dpi, fmt='PNG')
            
            if not pages:
                return {'error': 'Failed to convert PDF pages'}
            
            image_urls = []
            
            for i, page_image in enumerate(pages):
                # Save each page
                import uuid
                filename = f"pdf_page_{uuid.uuid4().hex}_{i}.png"
                image_path = os.path.join(self.static_dir, filename)
                
                # Resize to target dimensions
                target_width = 595
                target_height = 842
                
                img_width, img_height = page_image.size
                scale_width = target_width / img_width
                scale_height = target_height / img_height
                scale = min(scale_width, scale_height)
                
                new_width = int(img_width * scale)
                new_height = int(img_height * scale)
                
                resized_image = page_image.resize((new_width, new_height), Image.Resampling.LANCZOS)
                final_image = Image.new('RGB', (target_width, target_height), 'white')
                
                paste_x = (target_width - new_width) // 2
                paste_y = (target_height - new_height) // 2
                final_image.paste(resized_image, (paste_x, paste_y))
                
                final_image.save(image_path, 'PNG', quality=95)
                
                image_url = url_for('static', filename=f'uploads/{filename}')
                image_urls.append(image_url)
            
            return {
                'image_urls': image_urls,
                'page_count': len(pages),
                'target_width': target_width,
                'target_height': target_height
            }
            
        except Exception as e:
            logger.exception("PDF conversion error: %s", e)
            return {'error': f'PDF conversion failed: {str(e)}'}
    
    def get_pdf_info(self, pdf_path):
        """
        Get basic information about a PDF file
        
        Args:
            pdf_path (str): Path to the PDF file
            
        Returns:
            dict: PDF information
        """
        try:
            # Get page count by converting first page only
            pages = pdf2image.convert_from_path(
                pdf_path,
                dpi=100,
                first_page=1,
                last_page=1
            )
            
            if not pages:
                return {'error': 'Failed to read PDF'}
            
            # Get total page count (this is a bit inefficient but works)
            all_pages = pdf2image.convert_from_path(pdf_path, dpi=50)
            page_count = len(all_pages)
            
            # Get dimensions from first page
            first_page = pages[0]
            width, height = first_page.size
            
            return {
                'page_count': page_count,
                'width': width,
                'height': height,
                'format': 'PDF'
            }
            
        except Exception as e:
            logger.exception("PDF info error: %s", e)
            return {'error': f'Failed to get PDF info: {str(e)}'}
    
    def cleanup_temp_files(self, max_age_hours=24):
        """
        Clean up old temporary PDF image files
        
        Args:
            max_age_hours (int): Maximum age of files to keep in hours
        """
        try:
            import time
            current_time = time.time()
            max_age_seconds = max_age_hours * 3600
            
            for filename in os.listdir(self.static_dir):
                if filename.startswith('pdf_page_'):
                    file_path = os.path.join(self.static_dir, filename)
                    file_age = current_time - os.path.getctime(file_path)
                    
                    if file_age > max_age_seconds:
                        try:
                            os.remove(file_path)
                            logger.info("Cleaned up old PDF image: %s", filename)
                        except Exception as e:
                            logger.exception("Failed to cleanup %s: %s", filename, e)
                            
        except Exception as e:
            logger.exception("Cleanup error: %s", e)
