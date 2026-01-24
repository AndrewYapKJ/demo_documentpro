
# -*- encoding: utf-8 -*-
"""
Copyright (c) 2019 - present AppSeed.us
"""

from openai import OpenAI
from apps.home import blueprint
from flask import render_template, request, jsonify
from flask_login import login_required, current_user
from jinja2 import TemplateNotFound
import json
import os
import logging



logger = logging.getLogger(__name__)


@blueprint.route('/')
@login_required
def index():

    return render_template('home/index.html', segment='index')


@blueprint.route('/index/extractor-invoice')
@login_required
def extractor_extract():
    return render_template('home/extractor-invoice.html', segment='extractor-invoice')

@blueprint.route('/index/extractor-viewport')
@login_required  
def extractor_extract_viewport():
    return render_template('home/extractor-viewport.html', segment='extractor-viewport')

@blueprint.route('/index/extractor-list')
@login_required  
def extractor_list():
    from apps.models.extractor import Extractor
    from apps import db
    
    extractors = Extractor.query.filter_by(user_id=current_user.id).order_by(Extractor.created_at.desc()).all()
    
    return render_template('home/extractor-list.html', segment='extractor-list', workflows=extractors)


@blueprint.route('/api/extract', methods=['POST'])
def api_extract():
    """
    API endpoint to handle document extraction and save results
    Supports both text-based and vision-based extraction modes
    """
    try:
        # Get uploaded file
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file uploaded'})
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'})
        
        # Get schema configuration and extractor_id
        schema_json = request.form.get('schema', '{}')
        schema = json.loads(schema_json)
        extractor_id = request.form.get('extractor_id')
        
        # Get extraction mode (default to 'vision' for backward compatibility)
        extraction_mode = request.form.get('extraction_mode', 'vision')
        
        logger.info(f"Extraction mode: {extraction_mode}")
        
        # Read file content
        file_content = file.read()
        
        # Initialize the extraction service
        from apps.services.extraction_service import DocumentExtractionService
        extraction_service = DocumentExtractionService()
        
        # Extract data using OpenAI with specified mode
        results = extraction_service.extract_from_file(file_content, schema, mode=extraction_mode)
        
        return jsonify({
            'success': True,
            'results': results,
            'filename': file.filename,
            'extractor_id': extractor_id,
            'extraction_mode': extraction_mode
        })
        
    except Exception as e:
        logger.exception("Extraction error: %s", e)
        return jsonify({'success': False, 'error': str(e)})

@blueprint.route('/api/extractors/<int:extractor_id>', methods=['DELETE'])
@login_required
def api_delete_extractor(extractor_id):
    """
    Delete an extractor (only the owner can delete)
    """
    try:
        from apps.models.extractor import Extractor
        from apps import db

        # Find the extractor
        extractor = Extractor.query.filter_by(id=extractor_id, user_id=current_user.id).first()

        if not extractor:
            return jsonify({'success': False, 'error': 'Extractor not found or you do not have permission to delete it'}), 404

        db.session.delete(extractor)
        db.session.commit()

        return jsonify({'success': True, 'message': 'Extractor deleted successfully'})
    except Exception as e:
        logger.exception("Delete extractor error: %s", e)
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@blueprint.route('/api/chat', methods=['POST'])
def api_chat():
    """
    Chat endpoint for the embedded chat widget
    Handles user messages and returns bot responses
    """
    try:
        data = request.get_json()
        
        if not data or 'message' not in data:
            return jsonify({'success': False, 'error': 'message is required'}), 400
        
        user_message = data.get('message', '').strip()
        
        if not user_message:
            return jsonify({'success': False, 'error': 'message cannot be empty'}), 400
        
        client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
        
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a helpful assistant for document extraction and processing."},
                {"role": "user", "content": user_message}
            ],
            max_tokens=500,
            temperature=0.7
        )
        
        bot_reply = response.choices[0].message.content
        
        return jsonify({
            'success': True,
            'reply': bot_reply
        }), 200
    
    except Exception as e:
        logger.exception("Chat error: %s", e)
        return jsonify({'success': False, 'error': str(e)}), 500

@blueprint.route('/api/extract/<extractor_uid>', methods=['POST'])
def api_extract_by_uid(extractor_uid):
  
    try:
        from flask import current_app
        from apps.authentication.models import Users
        from apps.models.extractor import Extractor
        from apps.services.extraction_service import DocumentExtractionService
        
        api_key = request.headers.get('X-API-Key')
        
        if not api_key:
            return jsonify({
                'success': False, 
                'error': 'API key required. Please provide X-API-Key header'
            }), 401
        
        is_master_key = (api_key == current_app.config.get('MASTER_API_KEY'))
        
        if not is_master_key:
            user = Users.query.filter_by(api_key=api_key).first()
            
            if not user:
                return jsonify({
                    'success': False, 
                    'error': 'Invalid API key'
                }), 401
        else:
            user = None  
        
 
        extractor = Extractor.query.filter_by(uid=extractor_uid).first()
        
        if not extractor:
            return jsonify({'success': False, 'error': f'Extractor with UID {extractor_uid} not found'}), 404
        
     
        if not is_master_key and user:
            if extractor.user_id is not None and extractor.user_id != user.id:
                return jsonify({
                    'success': False, 
                    'error': 'You do not have permission to use this extractor'
                }), 403
         
  
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file uploaded'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400
        
      
        file_content = file.read()
        
   
        schema = extractor.schema
        
       
        extraction_service = DocumentExtractionService()
        
      
        results = extraction_service.extract_from_file(file_content, schema)
        
        return jsonify({
            'success': True,
            'results': results,
            'filename': file.filename,
        })
        
    except Exception as e:
        logger.exception("Extraction error: %s", e)
        return jsonify({'success': False, 'error': str(e)}), 500


@blueprint.route('/api/key', methods=['GET'])
@login_required
def get_api_key():
    """
    Get or generate API key for the current user
    """
    from apps import db
    
    # Generate API key if user doesn't have one
    if not current_user.api_key:
        import secrets
        current_user.api_key = secrets.token_urlsafe(32)
        db.session.commit()
    
    return jsonify({
        'success': True,
        'api_key': current_user.api_key
    })


@blueprint.route('/api/key/regenerate', methods=['POST'])
@login_required
def regenerate_api_key():
    """
    Regenerate API key for the current user
    """
    from apps import db
    import secrets
    
    current_user.api_key = secrets.token_urlsafe(32)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'api_key': current_user.api_key,
        'message': 'API key regenerated successfully'
    })


@blueprint.route('/api/extractors', methods=['POST'])
def api_create_extractor():
    """
    Create a new extractor (bot) with a name and schema JSON
    """
    try:
        name = request.form.get('name') or request.json.get('name')
        description = request.form.get('description') or request.json.get('description')
        schema_json = request.form.get('schema') or (request.json.get('schema') if request.is_json else None)

        if not name or not schema_json:
            return jsonify({'success': False, 'error': 'name and schema are required'}), 400

        schema = schema_json if isinstance(schema_json, dict) else json.loads(schema_json)

        from apps.models.extractor import Extractor
        from apps import db

        # Get user_id if user is authenticated
        user_id = current_user.id if current_user.is_authenticated else None

        extractor = Extractor(name=name, description=description, schema=schema, user_id=user_id)

        # Generate a unique uid and attempt to commit. If a collision occurs (very rare with UUID4),
        # retry a few times before failing.
        from sqlalchemy.exc import IntegrityError

        max_attempts = 5
        for attempt in range(max_attempts):
            extractor.uid = Extractor.generate_uid()
            db.session.add(extractor)
            try:
                db.session.commit()
                break
            except IntegrityError as ie:
                # UID collision or other unique constraint violation; rollback and retry UID
                db.session.rollback()
                if attempt == max_attempts - 1:
                    raise ie
                # otherwise, try again with a new uid
                continue

        return jsonify({'success': True, 'extractor': extractor.to_dict()})

    except Exception as e:
        logger.exception("Create extractor error: %s", e)
        return jsonify({'success': False, 'error': str(e)}), 500


@blueprint.route('/api/extractors/<int:extractor_id>', methods=['PUT'])
@login_required
def api_update_extractor(extractor_id):
    """
    Update an extractor's name (only the owner can update)
    """
    try:
        from apps.models.extractor import Extractor
        from apps import db
        
        # Find the extractor
        extractor = Extractor.query.filter_by(id=extractor_id, user_id=current_user.id).first()
        
        if not extractor:
            return jsonify({'success': False, 'error': 'Extractor not found or you do not have permission to edit it'}), 404
        
        # Get new name from request
        data = request.get_json()
        new_name = data.get('name', '').strip()
        
        if not new_name:
            return jsonify({'success': False, 'error': 'Name cannot be empty'}), 400
        
        # Update the name
        extractor.name = new_name
        db.session.commit()
        
        return jsonify({'success': True, 'extractor': extractor.to_dict()})
    
    except Exception as e:
        logger.exception("Update extractor error: %s", e)
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


def generate_dummy_data(schema):
    """Generate dummy data based on the schema for testing"""
    results = {}
    
    for field in schema.get('fields', []):
        field_name = field.get('name', '')
        field_type = field.get('type', 'text')
        
        if field_type == 'table':
            # Generate dummy table data based on the screenshot
            if field_name.lower() == 'line_items':
                results[field_name] = [
                    {
                        "description": "Website development",
                        "item_total_amount": 6000,
                        "quantity": 1,
                        "unit_price": 6000
                    },
                    {
                        "description": "Website Hosting (Monthly)",
                        "item_total_amount": 600,
                        "quantity": 1,
                        "unit_price": 600
                    },
                    {
                        "description": "Domain Purchase - .com",
                        "item_total_amount": 70,
                        "quantity": 1,
                        "unit_price": 70
                    },
                    {
                        "description": "Website Support and Maintenance",
                        "item_total_amount": 5000,
                        "quantity": 1,
                        "unit_price": 5000
                    }
                ]
            else:
                # Generic table data
                subfield_data = {}
                for subfield in field.get('subfields', []):
                    subfield_type = subfield.get('type', 'text')
                    if subfield_type == 'number':
                        subfield_data[subfield['name']] = 100.00
                    elif subfield_type == 'date':
                        subfield_data[subfield['name']] = '2024-05-19'
                    else:
                        subfield_data[subfield['name']] = f"Sample {subfield['name']}"
                results[field_name] = [subfield_data]
        
        elif field_type == 'number':
            # Use specific values based on field name
            if 'total' in field_name.lower():
                results[field_name] = 11670
            elif 'tax' in field_name.lower():
                results[field_name] = 0
            else:
                results[field_name] = 123.45
        
        elif field_type == 'date':
            results[field_name] = '2024-05-19'
        
        elif field_type == 'boolean':
            results[field_name] = True
        
        else:
            # String fields with specific dummy data
            if 'date' in field_name.lower():
                results[field_name] = '2024-05-19'
            elif 'number' in field_name.lower():
                results[field_name] = 'INV19052024001'
            elif 'seller' in field_name.lower() or 'vendor' in field_name.lower():
                results[field_name] = 'Cemerlang IT & Network Solutions'
            elif 'amount' in field_name.lower():
                results[field_name] = '11670'
            else:
                results[field_name] = f"Sample {field_name} value"
    
    return results


@blueprint.route('/<template>')
@login_required
def route_template(template):

    try:

        if not template.endswith('.html'):
            template += '.html'

        # Detect the current page
        segment = get_segment(request)

        # Serve the file (if exists) from app/templates/home/FILE.html
        return render_template("home/" + template, segment=segment)

    except TemplateNotFound:
        return render_template('home/page-404.html'), 404

    except:
        return render_template('home/page-500.html'), 500


@blueprint.route('/api/extractors/list', methods=['GET'])
def api_list_extractors():
    """
    Get list of extractors for a specific user
    Requires:
    - Header: X-API-Key with MASTER_API_KEY
    - Query param: username
    
    Returns:
    - List of extractors with name and uid (uuid)
    """
    try:
        from flask import current_app
        from apps.authentication.models import Users
        from apps.models.extractor import Extractor
        
        # Check for Master API key in headers
        api_key = request.headers.get('X-API-Key')
        
        if not api_key:
            return jsonify({
                'success': False, 
                'error': 'API key required. Please provide X-API-Key header with master token'
            }), 401
        
        # Verify it's the master API key
        master_key = current_app.config.get('MASTER_API_KEY')
        if api_key != master_key:
            return jsonify({
                'success': False, 
                'error': 'Invalid master API key'
            }), 403
        
        # Get username from query parameter
        username = request.args.get('username')
        
        if not username:
            return jsonify({
                'success': False, 
                'error': 'username parameter is required'
            }), 400
        
        # Find user by username
        user = Users.query.filter_by(username=username).first()
        
        if not user:
            return jsonify({
                'success': False, 
                'error': f'User not found: {username}'
            }), 404
        
        # Get all extractors for this user
        extractors = Extractor.query.filter_by(user_id=user.id).order_by(Extractor.created_at.desc()).all()
        
        # Format response with only name and uid
        extractor_list = [
            {
                'name': extractor.name,
                'uuid': extractor.uid
            }
            for extractor in extractors
        ]
        
        return jsonify({
            'success': True,
            'username': username,
            'user_id': user.id,
            'count': len(extractor_list),
            'extractors': extractor_list
        }), 200
        
    except Exception as e:
        logger.exception("List extractors error: %s", e)
        return jsonify({
            'success': False, 
            'error': str(e)
        }), 500


@blueprint.route('/api/extractors/<identifier>/schema', methods=['GET'])
def api_get_extractor_schema(identifier):
   
    try:
        from apps.models.extractor import Extractor
        
    
        try:
            extractor_id = int(identifier)
            is_id = True
        except ValueError:
            is_id = False
        
      
        if is_id:
        
            if not current_user.is_authenticated:
                return jsonify({
                    'success': False,
                    'error': 'Authentication required for access by ID'
                }), 401
            
            extractor = Extractor.query.filter_by(
                id=extractor_id,
                user_id=current_user.id
            ).first()
        else:
            # Access by UID is public
            extractor = Extractor.query.filter_by(uid=identifier).first()
        
        if not extractor:
            return jsonify({
                'success': False,
                'error': f'Extractor not found: {identifier}'
            }), 404
        
        # Get fields and convert types
        fields = extractor.schema.get('fields', []) if isinstance(extractor.schema, dict) else extractor.schema
        
        # Type mapping: UI types to standard data types
        type_mapping = {
            'text': 'string',
            'number': 'double',
            'date': 'datetime',
            'boolean': 'boolean',
            'table': 'array'
        }
        
        def convert_field_types(field):
            """Convert field types from UI format to standard format and remove position data"""
            # Only keep essential field properties
            converted = {
                'name': field.get('name'),
                'type': type_mapping.get(field.get('type'), field.get('type')),
                'description': field.get('description', '')
            }
            
            # Convert subfield types for table fields
            if 'subfields' in field and isinstance(field['subfields'], list):
                converted['subfields'] = [
                    {
                        'name': subfield.get('name'),
                        'type': type_mapping.get(subfield.get('type', 'text'), subfield.get('type', 'string')),
                        'description': subfield.get('description', '')
                    }
                    for subfield in field['subfields']
                ]
            
            return converted
        
        # Dynamically generate the results structure based on fields
        results = {}
        for field in fields:
            if 'subfields' in field:
                results[field['name']] = [
                    {
                        subfield['name']: type_mapping.get(subfield.get('type', 'text'), subfield.get('type', 'string')) for subfield in field['subfields']
                    }
                ]
            else:
                results[field['name']] = type_mapping.get(field.get('type', 'text'), field.get('type', 'string'))

        # Convert all fields
        converted_fields = [convert_field_types(field) for field in fields]

        return jsonify({
            'success': True,
            'id': extractor.id,
            'uid': extractor.uid,
            'name': extractor.name,
            'schema_version': extractor.schema,
            'description': extractor.description,
            'created_at': extractor.created_at.isoformat() if extractor.created_at else None,
            'fields': converted_fields,
            'results': results,
        }), 200

        
    except Exception as e:
        logger.exception("Get extractor schema error: %s", e)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@blueprint.route('/api/auto-generate-template', methods=['POST'])
@login_required
def api_auto_generate_template():
    """
    Auto-generate extraction template from uploaded invoice using OpenAI
    """
    try:
        # Get uploaded file
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file uploaded'})
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'})
        
        # Read file content
        file_content = file.read()
        
        # Initialize OpenAI client
        from apps.services.extraction_service import DocumentExtractionService
        extraction_service = DocumentExtractionService()
        
        if not extraction_service.client:
            return jsonify({'success': False, 'error': 'OpenAI client not initialized. Check API key.'})
        
        # Prepare image for OpenAI
        file_b64, mime_type = extraction_service._prepare_image_for_api(file_content)
        
        # Call OpenAI with prompt to analyze document structure
        prompt = """TASK: Analyze this document and create an extraction template for automated data extraction.

STEP 1 - DOCUMENT ANALYSIS:
First, identify:
- What type of document is this? (e.g., Invoice, Bill of Lading, Purchase Order, Receipt, Shipping Document, etc.)
- What is the primary purpose of this document?
- What are the COMPULSORY fields that MUST be present in this document type?
- What are the OPTIONAL fields that MAY be present?

STEP 2 - FIELD IDENTIFICATION:
For each field you identify, you must:
1. Verify that the field label/keyword ACTUALLY EXISTS in the document (do not assume or infer)
2. Provide the EXACT label text as it appears in the document
3. Give examples of the actual values you see for this field
4. Determine if this field is compulsory or optional for this document type

STEP 3 - EXTRACTION RULES:
Apply these STRICT rules:
1. Do NOT infer values based on column position or proximity
2. ONLY extract a field if the label or keyword explicitly exists near the value
3. If a field label is missing in the document, DO NOT include it in the template
4. Never shift values from neighboring columns to fill missing fields
5. Field names like "vessel_name", "vessel", "mv" should ONLY be included if keywords like:
   "Vessel", "Vessel Name", "MV", "M/V", "VSL" are explicitly present
6. Port fields should ONLY be included if labels like "Port of Loading", "POL", "Port of Discharge", "POD" exist
7. If fewer values appear than headers in a table, do NOT assume alignment - mark as unreliable
8. For table fields, verify that all column headers are clearly visible and identifiable

STEP 4 - FIELD DESCRIPTION FORMAT:
For each field, provide a COMPLETE description with:
- Purpose: What this field represents
- Label variants: All possible label names found in this document type (e.g., "Invoice No.", "Inv#", "Reference Number")
- Location: Where in the document this field typically appears (e.g., "top right header", "below company logo", "in the line items table")
- Format: Expected format/pattern (e.g., "alphanumeric like INV-2024-001", "date format YYYY-MM-DD", "decimal number")
- Validation: Any constraints (e.g., "must not be empty", "must be positive number")
- Example: Actual example value you see in this document

STEP 5 - OUTPUT FORMAT:
Return ONLY a valid JSON object with this exact structure:
{
    "document_type": "identified document type",
    "document_purpose": "brief description of what this document is used for",
    "template_name": "suggested template name based on document type",
    "fields": [
        {
            "name": "field_name_in_snake_case",
            "type": "text|number|date|table",
            "compulsory": true|false,
            "description": "Complete description following STEP 4 format above. Include: Purpose, Label variants (comma-separated), Location, Format, Validation rules, Example value from this document",
            "label_in_document": "exact label text as it appears in the document",
            "example_value": "actual value found in this document",
            "subfields": [  // only for table type
                {
                    "name": "column_name_in_snake_case",
                    "type": "text|number|date",
                    "description": "Complete description with purpose, label variants, format, validation",
                    "label_in_document": "exact column header text",
                    "example_value": "actual value from first row"
                }
            ]
        }
    ]
}

IMPORTANT REMINDERS:
- This template will be used for AUTOMATED extraction - accuracy is critical
- If you're unsure whether a field exists, DO NOT include it
- Better to have fewer accurate fields than many inaccurate ones
- Cross-check that each field you include actually has a visible label in the document
- Descriptions must be detailed enough for extraction logic to find the exact field location"""
        
        response = extraction_service.client.chat.completions.create(
            model="gpt-5.2",
            messages=[
                {
                    "role": "system",
                    "content": "You are a document analysis expert. Analyze documents and extract field definitions for data extraction templates."
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{file_b64}"
                            }
                        }
                    ]
                }
            ],
            response_format={"type": "json_object"}
        )
        
        # Parse response
        template_data = json.loads(response.choices[0].message.content)
        logger.info("Auto-generated template: %s", template_data)
        
        # Save to database
        from apps.models.extractor import Extractor
        from apps import db
        
        template_name = template_data.get('template_name', f'Auto-generated {file.filename}')
        
        # Create schema structure
        schema = {
            'fields': template_data.get('fields', []),
            'documentMetadata': {
                'source': 'auto-generated',
                'filename': file.filename
            }
        }
        
        # Create new extractor
        new_extractor = Extractor(
            uid=Extractor.generate_uid(),
            user_id=current_user.id,
            name=template_name,
            description=f'Auto-generated template from {file.filename}',
            schema=schema
        )
        
        db.session.add(new_extractor)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'template': template_data,
            'extractor_id': new_extractor.id,
            'extractor_uid': new_extractor.uid,
            'message': f'Template "{template_name}" created successfully!'
        })
        
    except json.JSONDecodeError as e:
        logger.exception("JSON parsing error in OpenAI response: %s", e)
        return jsonify({'success': False, 'error': 'Failed to parse template data from AI response'})
    except Exception as e:
        logger.exception("Auto-generate template error: %s", e)
        return jsonify({'success': False, 'error': str(e)})


# Helper - Extract current page name from request
def get_segment(request):

    try:

        segment = request.path.split('/')[-1]

        if segment == '':
            segment = 'index'

        return segment

    except:
        return None
