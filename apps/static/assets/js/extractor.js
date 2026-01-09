/**
 * Extractor Page JavaScript
 * Handles field editing, table management, and theme switching
 */

// Silence native console.log in production unless DEBUG=true
if (typeof window !== 'undefined' && (typeof window.DEBUG === 'undefined' || !window.DEBUG)) {
    console.log = function(){};
}


class ExtractorManager {
    constructor() {
        this.currentPDF = null;
        this.currentContainer = null;
        this.baseScale = null;
        this.baseViewport = null;
        this.resizeListener = null;
        this.resizeObserver = null;
        this.sidebarObserver = null;
        this.resizeTimeout = null;
        this.lastContainerWidth = 0;
        
        this.originalSchemaContent = null;
        this.lastExtractionResults = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupTableFieldEvents();
        this.reinitializeEventListeners();
        this.applyThemeStyles();
        this.setupThemeObserver();
        this.initializeUploadState();
    }

    initializeUploadState() {
        const documentPanel = document.querySelector('.extractor-document-panel');
        if (documentPanel) {
            documentPanel.classList.add('upload-only');
        }
    }

    setupEventListeners() {
        const navbarToggles = document.querySelectorAll('#mobile-collapse, #mobile-collapse1, .mobile-menu');
        navbarToggles.forEach(toggle => {
            toggle.addEventListener('click', () => this.handleNavbarToggle());
        });

        document.querySelectorAll('.action-btn, .save-btn, .cancel-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleFieldAction(e));
        });

        const addFieldBtn = document.querySelector('.extractor-add-field-btn');
        if (addFieldBtn) {
            addFieldBtn.addEventListener('click', (e) => this.handleAddField(e));
        }

        const uploadBtn = document.querySelector('.upload-btn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', (e) => this.handleUpload(e));
        }

        this.setupDragAndDrop();

        const extractBtn = document.querySelector('.extractor-bottom-bar .dashboard-btn-primary');
        if (extractBtn) {
            extractBtn.addEventListener('click', (e) => this.handleExtract(e));
        }

        this.setupRealTimeFieldEditing();
    }

    attachExtractButtonListener() {
        console.log('Attaching extract button listener...');
        const extractBtn = document.querySelector('.extractor-bottom-bar .dashboard-btn-primary');
        if (extractBtn) {
            console.log('Extract button found');
            const newExtractBtn = extractBtn.cloneNode(true);
            extractBtn.parentNode.replaceChild(newExtractBtn, extractBtn);
            
            newExtractBtn.addEventListener('click', (e) => this.handleExtract(e));
            console.log('Extract button listener attached');
        } else {
            console.warn('Extract button not found');
        }
    }

    setupDragAndDrop() {
        const uploadCard = document.querySelector('.upload-card');
        if (!uploadCard) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadCard.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            uploadCard.addEventListener(eventName, () => {
                uploadCard.classList.add('drag-highlight');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            uploadCard.addEventListener(eventName, () => {
                uploadCard.classList.remove('drag-highlight');
            });
        });

        uploadCard.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.processUploadedFile(files[0]);
            }
        });
    }

    setupRealTimeFieldEditing() {
        document.querySelectorAll('.field-name-input').forEach(input => {
            if (!input.hasAttribute('data-listener-attached')) {
                input.addEventListener('input', (e) => {
                    const field = e.target.closest('.extractor-field-row');
                    const fieldNameSpan = field.querySelector('.field-name');
                    if (fieldNameSpan) {
                        fieldNameSpan.textContent = e.target.value || 'unnamed_field';
                    }
                });
                input.setAttribute('data-listener-attached', 'true');
            }
        });

        document.querySelectorAll('.field-desc-input').forEach(textarea => {
            if (!textarea.hasAttribute('data-listener-attached')) {
                textarea.addEventListener('input', (e) => {
                    const field = e.target.closest('.extractor-field-row');
                    const fieldDescDiv = field.querySelector('.field-description');
                    if (fieldDescDiv) {
                        fieldDescDiv.textContent = e.target.value || 'No description provided';
                    }
                });
                textarea.setAttribute('data-listener-attached', 'true');
            }
        });
    }

    handleNavbarToggle() {
        const mainRow = document.querySelector('.extractor-main-row');
    }

    handleFieldAction(e) {
        e.preventDefault();
        const btn = e.target.closest('button');
        
        if (!btn) {
            console.error('No button found in handleFieldAction');
            return;
        }
        
        const action = btn.dataset.action;
        const idx = btn.dataset.idx;
        
        console.log(`Handling field action: ${action} for field ${idx}`);
        
        const field = document.getElementById(`field-${idx}`);
        const editor = document.getElementById(`editor-${idx}`);

        if (!field || !editor) {
            console.error(`Field or editor not found: field-${idx}, editor-${idx}`);
            return;
        }

        switch (action) {
            case 'edit':
                this.editField(field, editor);
                break;
            case 'save':
                this.saveField(field, editor, idx);
                break;
            case 'cancel':
                this.cancelEdit(field, editor);
                break;
            case 'delete':
                this.deleteField(field, idx);
                break;
            default:
                console.error(`Unknown action: ${action}`);
        }
    }

    editField(field, editor) {
        this.collapseAllFields();
        field.classList.add('expanded');
        editor.style.display = 'flex';

        const fieldNameInput = editor.querySelector('.field-name-input');
        const fieldDescInput = editor.querySelector('.field-desc-input');
        const fieldTypeSelect = editor.querySelector('.field-type-select');
        
        if (fieldNameInput) fieldNameInput.dataset.originalValue = fieldNameInput.value;
        if (fieldDescInput) fieldDescInput.dataset.originalValue = fieldDescInput.value;
        if (fieldTypeSelect) fieldTypeSelect.dataset.originalValue = fieldTypeSelect.value;

        const tableColumns = editor.querySelectorAll('.table-column-row');
        tableColumns.forEach(columnRow => {
            const nameInput = columnRow.querySelector('.column-name-input');
            const descInput = columnRow.querySelector('.column-description-input');
            const typeSelect = columnRow.querySelector('.column-type-select');
            
            if (nameInput) nameInput.dataset.originalValue = nameInput.value;
            if (descInput) descInput.dataset.originalValue = descInput.value;
            if (typeSelect) typeSelect.dataset.originalValue = typeSelect.value;
        });

        const fieldNameSpan = field.querySelector('.field-name');
        const fieldDescDiv = field.querySelector('.field-description');
        const typeBadge = field.querySelector('.field-type-badge');

        if (fieldNameSpan) {
            editor.dataset.originalFieldName = fieldNameSpan.textContent;
        }
        if (fieldDescDiv) {
            editor.dataset.originalFieldDesc = fieldDescDiv.textContent;
        }
        if (typeBadge) {
            editor.dataset.originalFieldType = typeBadge.textContent;
            editor.dataset.originalFieldTypeClass = typeBadge.className;
        }
    }

    saveField(field, editor, idx) {
        this.updateFieldDisplay(field, editor);
        
        if (field.hasAttribute('data-is-new-field')) {
            field.removeAttribute('data-is-new-field');
        }
        
        field.classList.remove('expanded');
        editor.style.display = 'none';

        const fieldTypeSelect = editor.querySelector('.field-type-select');
        const tableSubfields = field.querySelector('.table-subfields');

        if (fieldTypeSelect?.value === 'table' && tableSubfields) {
            tableSubfields.style.display = 'block';
            field.classList.add('table-field');

            this.syncTableConfigurationToDisplay(field, editor);
        }

        this.attachExtractButtonListener();

        console.log('Saving field:', idx);
    }

    syncTableConfigurationToDisplay(field, editor) {
        const tableColumns = editor.querySelectorAll('.table-column-row');
        const subfieldsContainer = field.querySelector('.subfields-container');
        const addSubfieldBtn = subfieldsContainer?.querySelector('.add-subfield-btn');
        
        if (!subfieldsContainer || !addSubfieldBtn) return;

        const existingWrappers = subfieldsContainer.querySelectorAll('.subfield-wrapper');
        existingWrappers.forEach(wrapper => wrapper.remove());

        tableColumns.forEach((columnRow, index) => {
            const nameInput = columnRow.querySelector('.column-name-input');
            const descInput = columnRow.querySelector('.column-description-input');
            const typeSelect = columnRow.querySelector('.column-type-select');

            const name = nameInput?.value || 'new_column';
            const desc = descInput?.value || 'Column description';
            const type = typeSelect?.value || 'text';

            const subfieldHtml = `
                <div class="subfield-wrapper">
                    <div class="subfield-row">
                        <div>
                            <span class="subfield-name">${name}</span>
                            <span class="subfield-type ${type}">${type}</span>
                        </div>
                        <button class="column-delete-btn delete-subfield-btn" data-subfield="${name}" title="Remove Column">×</button>
                    </div>
                    <div class="subfield-description">${desc}</div>
                </div>
            `;

            addSubfieldBtn.insertAdjacentHTML('beforebegin', subfieldHtml);
        });

        const newDeleteBtns = subfieldsContainer.querySelectorAll('.delete-subfield-btn');
        newDeleteBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.handleDeleteSubfield(e));
        });

        tableColumns.forEach(columnRow => {
            const removeBtn = columnRow.querySelector('.remove-column-btn');
            if (removeBtn) {
                const newBtn = removeBtn.cloneNode(true);
                removeBtn.parentNode.replaceChild(newBtn, removeBtn);
                newBtn.addEventListener('click', (e) => this.handleRemoveColumn(e));
            }
        });

        this.applyThemeStyles();
        
        this.attachExtractButtonListener();
    }

    updateFieldDisplay(field, editor) {
        const nameInput = editor.querySelector('.field-name-input');
        const fieldNameSpan = field.querySelector('.field-name');
        if (nameInput && fieldNameSpan) {
            fieldNameSpan.textContent = nameInput.value || 'unnamed_field';
        }

        const descInput = editor.querySelector('.field-desc-input');
        const fieldDescDiv = field.querySelector('.field-description');
        if (descInput && fieldDescDiv) {
            fieldDescDiv.textContent = descInput.value || 'No description provided';
        }

        const typeSelect = editor.querySelector('.field-type-select');
        const typeBadge = field.querySelector('.field-type-badge');
        if (typeSelect && typeBadge) {
            const newType = typeSelect.value;
            typeBadge.textContent = newType;
            typeBadge.className = `field-type-badge ${newType}`;
            
            if (newType === 'table') {
                field.classList.add('table-field');
            } else {
                field.classList.remove('table-field');
            }
        }

        this.applyThemeStyles();
    }

    cancelEdit(field, editor) {
        const nameInput = editor.querySelector('.field-name-input');
        const descInput = editor.querySelector('.field-desc-input');
        const typeSelect = editor.querySelector('.field-type-select');

        if (nameInput && nameInput.dataset.originalValue !== undefined) {
            nameInput.value = nameInput.dataset.originalValue;
        }
        if (descInput && descInput.dataset.originalValue !== undefined) {
            descInput.value = descInput.dataset.originalValue;
        }
        if (typeSelect && typeSelect.dataset.originalValue !== undefined) {
            typeSelect.value = typeSelect.dataset.originalValue;
        }

        const fieldNameSpan = field.querySelector('.field-name');
        const fieldDescDiv = field.querySelector('.field-description');
        const typeBadge = field.querySelector('.field-type-badge');

        if (fieldNameSpan && editor.dataset.originalFieldName !== undefined) {
            fieldNameSpan.textContent = editor.dataset.originalFieldName;
        }
        if (fieldDescDiv && editor.dataset.originalFieldDesc !== undefined) {
            fieldDescDiv.textContent = editor.dataset.originalFieldDesc;
        }
        if (typeBadge && editor.dataset.originalFieldType !== undefined) {
            typeBadge.textContent = editor.dataset.originalFieldType;
            if (editor.dataset.originalFieldTypeClass !== undefined) {
                typeBadge.className = editor.dataset.originalFieldTypeClass;
            }
        }

        const originalType = editor.dataset.originalFieldType;
        if (originalType === 'table') {
            field.classList.add('table-field');
        } else {
            field.classList.remove('table-field');
        }

        const tableColumns = editor.querySelectorAll('.table-column-row');
        tableColumns.forEach((columnRow, index) => {
            const nameInput = columnRow.querySelector('.column-name-input');
            const descInput = columnRow.querySelector('.column-description-input');
            const typeSelect = columnRow.querySelector('.column-type-select');
            
            if (nameInput && nameInput.dataset.originalValue !== undefined) {
                nameInput.value = nameInput.dataset.originalValue;
            }
            if (descInput && descInput.dataset.originalValue !== undefined) {
                descInput.value = descInput.dataset.originalValue;
            }
            if (typeSelect && typeSelect.dataset.originalValue !== undefined) {
                typeSelect.value = typeSelect.dataset.originalValue;
            }
        });

        const newlyAddedColumns = Array.from(tableColumns).filter(columnRow => {
            const nameInput = columnRow.querySelector('.column-name-input');
            return nameInput && nameInput.dataset.originalValue === undefined;
        });
        newlyAddedColumns.forEach(columnRow => columnRow.remove());

        if (originalType === 'table') {
            const remainingColumns = editor.querySelectorAll('.table-column-row');
            remainingColumns.forEach((columnRow, index) => {
                const subfieldsContainer = field.querySelector('.table-subfields');
                if (subfieldsContainer) {
                    const subfieldWrappers = subfieldsContainer.querySelectorAll('.subfield-wrapper');
                    const targetWrapper = subfieldWrappers[index];
                    if (targetWrapper) {
                        this.syncSubfieldDisplay(columnRow, targetWrapper);
                    }
                }
            });
        }

        const tableSubfields = field.querySelector('.table-subfields');
        if (tableSubfields && originalType !== 'table') {
            tableSubfields.style.display = 'none';
        } else if (tableSubfields && originalType === 'table') {
            tableSubfields.style.display = 'block';
        }

        if (field.hasAttribute('data-is-new-field')) {
            field.remove();
            return;
        }

        field.classList.remove('expanded');
        editor.style.display = 'none';
    }

    deleteField(field, idx) {
        if (confirm('Delete this field?')) {
            field.remove();
            console.log('Deleted field:', idx);
        }
    }

    handleAddField(e) {
        e.preventDefault();
        
        const schemaCard = document.querySelector('.extractor-schema-card');
        const addFieldBtn = document.querySelector('.extractor-add-field-btn');
        
        if (!schemaCard || !addFieldBtn) {
            console.error('Schema container or add button not found');
            return;
        }
        
        const existingFields = document.querySelectorAll('.extractor-field-row');
        const nextIndex = existingFields.length + 1;
        
        const newFieldHtml = this.createNewFieldHtml(nextIndex);
        
        addFieldBtn.insertAdjacentHTML('beforebegin', newFieldHtml);
        
        const newField = document.getElementById(`field-${nextIndex}`);
        const newEditor = document.getElementById(`editor-${nextIndex}`);
        
        if (newField && newEditor) {
            newField.setAttribute('data-is-new-field', 'true');
            
            newField.querySelectorAll('.action-btn, .save-btn, .cancel-btn').forEach(btn => {
                btn.addEventListener('click', (e) => this.handleFieldAction(e));
            });
            
            const nameInput = newEditor.querySelector('.field-name-input');
            const descInput = newEditor.querySelector('.field-desc-input');
            
            if (nameInput) {
                nameInput.addEventListener('input', (e) => {
                    const fieldNameSpan = newField.querySelector('.field-name');
                    if (fieldNameSpan) {
                        fieldNameSpan.textContent = e.target.value || 'unnamed_field';
                    }
                });
            }
            
            if (descInput) {
                descInput.addEventListener('input', (e) => {
                    const fieldDescDiv = newField.querySelector('.field-description');
                    if (fieldDescDiv) {
                        fieldDescDiv.textContent = e.target.value || 'No description';
                    }
                });
            }
            
            this.setupTableFieldEventsForElement(newEditor);
            this.applyThemeStyles();
            
            setTimeout(() => {
                this.editField(newField, newEditor);
                const nameInput = newEditor.querySelector('.field-name-input');
                if (nameInput) {
                    nameInput.focus();
                    nameInput.select();
                }
            }, 100);
        }
        
        console.log('Added new field with index:', nextIndex);
    }

    createNewFieldHtml(index) {
        return `
            <div class="extractor-field-row" id="field-${index}">
                <div class="field-header">
                    <div>
                        <span class="field-name">new_field_${index}</span>
                        <span class="field-type-badge text">text</span>
                    </div>
                    <div class="field-actions">
                        <button class="action-btn edit-btn" data-idx="${index}" data-action="edit" title="Edit Field">
                            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 20h9"/>
                                <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                            </svg>
                        </button>
                        <button class="action-btn delete delete-btn" data-idx="${index}" data-action="delete" title="Delete Field">
                            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 6h18"/>
                                <path d="M8 6v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6"/>
                                <path d="M10 11v6"/>
                                <path d="M14 11v6"/>
                                <path d="M5 6V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="field-description">Description for new field ${index}</div>
                
                <!-- Field Editor (Hidden by default) -->
                <div class="field-editor" id="editor-${index}">
                    <div class="row">
                        <div class="col-md-6">
                            <label class="field-label">Field Type</label>
                            <select class="form-control field-type-select">
                                <option value="text" selected>Text</option>
                                <option value="number">Number</option>
                                <option value="date">Date</option>
                                <option value="boolean">Boolean</option>
                                <option value="table">Table</option>
                            </select>
                        </div>
                        <div class="col-md-6">
                            <label class="field-label">Field Name</label>
                            <input type="text" class="form-control field-name-input" value="new_field_${index}">
                        </div>
                    </div>
                    <div>
                        <label class="field-label">Field Description</label>
                        <textarea class="form-control field-desc-input" rows="3" placeholder="#DESCRIPTION: short description of the field&#10;&#10;# LABEL SYNONYM: e.g., 'Invoice No.', 'Inv #', 'Ref No.'&#10;&#10;# LOCATION: e.g. in the header or bottom of page or next to delivery address"></textarea>
                    </div>
                    
                    <!-- Table Field Configuration -->
                    <div class="table-config" style="display:none;">
                        <label class="table-config-title">Table Columns Configuration</label>
                        <div class="table-columns">
                        </div>
                        <button type="button" class="add-column-btn">+ Add Column</button>
                    </div>
                    
                    <div class="editor-actions table-action-buttons">
                        <button class="table-save-btn save-btn" data-idx="${index}" data-action="save">Save</button>
                        <button class="table-cancel-btn cancel-btn" data-idx="${index}" data-action="cancel">Cancel</button>
                    </div>
                </div>
            </div>
        `;
    }

    handleUpload(e) {
        e.preventDefault();
        console.log('Upload button clicked');
        
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.pdf,.png,.jpg,.jpeg';
        fileInput.multiple = false;
        
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                console.log('File selected from input:', file.name);
                this.processUploadedFile(file);
            }
        });
        
        fileInput.click();
    }

    processUploadedFile(file) {
        console.log('Processing uploaded file:', file.name);
        
        const maxSize = 10 * 1024 * 1024; // 10MB in bytes
        if (file.size > maxSize) {
            alert('File size exceeds 10MB limit. Please choose a smaller file.');
            return;
        }

        const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
        if (!allowedTypes.includes(file.type)) {
            alert('Please select a PDF, PNG, or JPG file.');
            return;
        }

        console.log('File validation passed, updating display...');
        
        this.updateUploadDisplay(file);
        
        this.selectedFile = file;
        
        console.log('File selected:', file.name, 'Size:', file.size, 'Type:', file.type);
    }

    updateUploadDisplay(file) {
        console.log('Updating upload display for file:', file.name);
        
        const uploadCard = document.querySelector('.upload-card');
        const documentPreview = document.querySelector('.document-preview-container');
        const documentPanel = document.querySelector('.extractor-document-panel');
        
        if (!uploadCard || !documentPreview) {
            console.error('Upload card or document preview container not found');
            return;
        }
        
        if (documentPanel) {
            documentPanel.classList.remove('upload-only');
        }
        
        uploadCard.style.display = 'none';
        documentPreview.style.display = 'flex';
        
        const documentName = documentPreview.querySelector('.document-name');
        const documentSize = documentPreview.querySelector('.document-size');
        
        if (documentName) documentName.textContent = file.name;
        if (documentSize) documentSize.textContent = this.formatFileSize(file.size);
        
        const uploadBtn = documentPreview.querySelector('.upload-btn');
        const removeBtn = documentPreview.querySelector('.remove-file-btn');
        
        if (uploadBtn) {
            uploadBtn.replaceWith(uploadBtn.cloneNode(true));
            const newUploadBtn = documentPreview.querySelector('.upload-btn');
            newUploadBtn.addEventListener('click', (e) => this.handleUpload(e));
        }
        if (removeBtn) {
            removeBtn.replaceWith(removeBtn.cloneNode(true));
            const newRemoveBtn = documentPreview.querySelector('.remove-file-btn');
            newRemoveBtn.addEventListener('click', (e) => this.handleRemoveFile(e));
        }
        
        this.renderDocumentContent(file);
        
        console.log('Document preview updated successfully');
    }

    renderDocumentContent(file) {
        console.log('Rendering document content for:', file.name, 'Type:', file.type);
        
        const documentContent = document.querySelector('.document-content');
        if (!documentContent) {
            console.error('Document content container not found');
            return;
        }

        this.cleanupPDFObservers();
        
        documentContent.innerHTML = '<div class="loading-preview">Loading document...</div>';
        
        if (file.type === 'application/pdf') {
            this.renderPDFWithCanvas(documentContent, file);
        } else if (file.type.startsWith('image/')) {
            this.renderImageContent(documentContent, file);
        } else {
            documentContent.innerHTML = '<div class="unsupported-file">Preview not available for this file type</div>';
        }
    }

    renderPDFWithCanvas(container, file) {
        console.log('Rendering PDF with Canvas');
        
        const fileURL = URL.createObjectURL(file);
        
        if (typeof pdfjsLib === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.onload = () => {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                this.loadAndRenderPDF(fileURL, container);
            };
            script.onerror = () => {
                console.error('Failed to load PDF.js');
                container.innerHTML = '<div class="pdf-error">Failed to load PDF viewer</div>';
            };
            document.head.appendChild(script);
        } else {
            this.loadAndRenderPDF(fileURL, container);
        }
    }

    async loadAndRenderPDF(fileURL, container) {
        try {
            console.log('Loading PDF...');
            const pdf = await pdfjsLib.getDocument(fileURL).promise;
            console.log(`PDF loaded. Number of pages: ${pdf.numPages}`);

            container.innerHTML = '';

            const pagesContainer = document.createElement('div');
            pagesContainer.className = 'pdf-pages-container';
            container.appendChild(pagesContainer);

            const firstPage = await pdf.getPage(1);
            const firstPageViewport = firstPage.getViewport({ scale: 1 });
            
            const containerWidth = pagesContainer.clientWidth || container.clientWidth || 600;
            const baseDisplayScale = Math.min((containerWidth - 20) / firstPageViewport.width, 3);
            
            this.currentPDF = pdf;
            this.currentContainer = pagesContainer;
            this.baseScale = baseDisplayScale;
            this.baseViewport = firstPageViewport;

            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                await this.renderPDFPage(pdf, pageNum, pagesContainer, baseDisplayScale);
            }

            URL.revokeObjectURL(fileURL);
            
            this.setupPDFResizeListener();
            
        } catch (error) {
            console.error('Error loading PDF:', error);
            container.innerHTML = `
                <div class="pdf-error">
                    <p>Error loading PDF: ${error.message}</p>
                </div>
            `;
        }
    }

    async renderPDFPage(pdf, pageNum, container, displayScale = null) {
        try {
            const page = await pdf.getPage(pageNum);
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            const devicePixelRatio = window.devicePixelRatio || 1;
            
            let finalDisplayScale;
            if (displayScale !== null) {
                finalDisplayScale = displayScale;
            } else {
                const containerWidth = container.clientWidth || 600;
                const viewport = page.getViewport({ scale: 1 });
                finalDisplayScale = Math.min((containerWidth - 20) / viewport.width, 3);
            }
            
            const viewport = page.getViewport({ scale: 1 });
            const renderScale = finalDisplayScale * 3 * devicePixelRatio; 
            const scaledViewport = page.getViewport({ scale: renderScale });

            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;
            
            const displayWidth = (viewport.width * finalDisplayScale);
            const displayHeight = (viewport.height * finalDisplayScale);
            
            canvas.style.width = displayWidth + 'px';
            canvas.style.height = displayHeight + 'px';
            canvas.style.maxWidth = '100%';
            canvas.style.display = 'block';
            canvas.style.border = '1px solid #e2e8f0';
            canvas.style.borderRadius = '8px';
            canvas.className = 'pdf-page';
            
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            if (ctx.textRenderingOptimization) {
                ctx.textRenderingOptimization = 'optimizeQuality';
            }
            
            container.appendChild(canvas);

            const renderContext = {
                canvasContext: ctx,
                viewport: scaledViewport
            };
            
            await page.render(renderContext).promise;
            console.log(`Page ${pageNum} rendered successfully`);
            
        } catch (error) {
            console.error(`Error rendering page ${pageNum}:`, error);
        }
    }

    setupPDFResizeListener() {
        if (this.resizeListener) {
            window.removeEventListener('resize', this.resizeListener);
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        
        if (this.currentContainer && 'ResizeObserver' in window) {
            this.resizeObserver = new ResizeObserver((entries) => {
                for (let entry of entries) {
                    const newWidth = entry.contentRect.width;
                    if (Math.abs(newWidth - this.lastContainerWidth) > 10) {
                        this.lastContainerWidth = newWidth;
                        clearTimeout(this.resizeTimeout);
                        this.resizeTimeout = setTimeout(() => {
                            this.handlePDFResize();
                        }, 100);
                    }
                }
            });
            this.resizeObserver.observe(this.currentContainer);
            this.lastContainerWidth = this.currentContainer.clientWidth;
        }
        
        this.resizeListener = () => {
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => {
                this.handlePDFResize();
            }, 150);
        };
        window.addEventListener('resize', this.resizeListener);
        
        const navbar = document.querySelector('.pcoded-navbar');
        if (navbar) {
            const observer = new MutationObserver(() => {
                setTimeout(() => {
                    this.handlePDFResize();
                }, 350); // Wait for sidebar animation
            });
            observer.observe(navbar, { 
                attributes: true, 
                attributeFilter: ['class'] 
            });
            this.sidebarObserver = observer;
        }
    }

    handlePDFResize() {
        if (!this.currentPDF || !this.currentContainer || !this.baseViewport) {
            return;
        }
        
        this.currentContainer.style.display = 'none';
        this.currentContainer.offsetHeight; // Trigger reflow
        this.currentContainer.style.display = '';
        
        const containerWidth = this.currentContainer.clientWidth || this.currentContainer.offsetWidth || 600;
        const newDisplayScale = Math.min((containerWidth - 20) / this.baseViewport.width, 3);
        
        console.log('Resize detected:', {
            containerWidth,
            oldScale: this.baseScale,
            newScale: newDisplayScale
        });
        
        if (Math.abs(newDisplayScale - this.baseScale) > 0.02) {
            this.baseScale = newDisplayScale;
            this.reRenderPDFPages();
        }
    }

    async reRenderPDFPages() {
        if (!this.currentPDF || !this.currentContainer) {
            return;
        }
        
        this.currentContainer.innerHTML = '';
        
        for (let pageNum = 1; pageNum <= this.currentPDF.numPages; pageNum++) {
            await this.renderPDFPage(this.currentPDF, pageNum, this.currentContainer, this.baseScale);
        }
    }

    cleanupPDFObservers() {
        if (this.resizeListener) {
            window.removeEventListener('resize', this.resizeListener);
            this.resizeListener = null;
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        if (this.sidebarObserver) {
            this.sidebarObserver.disconnect();
            this.sidebarObserver = null;
        }
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = null;
        }
    }

    renderImageContent(container, file) {
        console.log('Rendering image content');
        
        const fileURL = URL.createObjectURL(file);
        
        container.innerHTML = '';
        
        const img = document.createElement('img');
        img.src = fileURL;
        img.style.width = '100%';
        img.style.height = 'auto';
        img.style.display = 'block';
        img.style.borderRadius = '8px';
        img.style.border = '1px solid #e2e8f0';
        img.className = 'document-image';
        
        img.onload = () => {
            URL.revokeObjectURL(fileURL);
            console.log('Image loaded successfully');
        };
        
        img.onerror = () => {
            console.error('Error loading image');
            container.innerHTML = `
                <div class="image-error">
                    <p>Error loading image</p>
                </div>
            `;
            URL.revokeObjectURL(fileURL);
        };
        
        container.appendChild(img);
    }

    createDocumentPreviewContainer() {
        const uploadPanel = document.querySelector('.extractor-upload-panel');
        
        const previewContainer = document.createElement('div');
        previewContainer.className = 'document-preview';
        previewContainer.innerHTML = `
            <div class="dashboard-card preview-card">
                <div class="preview-header">
                    <div class="preview-title">Document Preview</div>
                    <button class="preview-toggle-btn" title="Toggle Preview">
                        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M6 9l6 0"/>
                        </svg>
                    </button>
                </div>
                <div class="preview-content">
                    <!-- Document content will be rendered here -->
                </div>
            </div>
        `;
        
        uploadPanel.appendChild(previewContainer);
        
        const toggleBtn = previewContainer.querySelector('.preview-toggle-btn');
        const previewContent = previewContainer.querySelector('.preview-content');
        
        toggleBtn.addEventListener('click', () => {
            const isCollapsed = previewContent.style.display === 'none';
            previewContent.style.display = isCollapsed ? 'block' : 'none';
            toggleBtn.innerHTML = isCollapsed ? 
                '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 0"/></svg>' :
                '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 6l-6 6-6-6"/></svg>';
        });
        
        return previewContainer;
    }

    renderPDFContent(container, fileURL, fileName) {
        console.log('Rendering PDF content');
        
        container.innerHTML = `
            <div class="pdf-viewer">
                <div class="pdf-controls">
                    <button class="pdf-control-btn" id="pdf-prev">
                        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M15 18l-6-6 6-6"/>
                        </svg>
                        Previous
                    </button>
                    <span class="pdf-page-info">
                        Page <span id="pdf-current-page">1</span> of <span id="pdf-total-pages">-</span>
                    </span>
                    <button class="pdf-control-btn" id="pdf-next">
                        Next
                        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 18l6-6-6-6"/>
                        </svg>
                    </button>
                </div>
                <div class="pdf-container">
                    <embed src="${fileURL}" type="application/pdf" width="100%" height="600px">
                    <div class="pdf-fallback">
                        <p>Your browser doesn't support PDF preview.</p>
                        <a href="${fileURL}" target="_blank" class="dashboard-btn dashboard-btn-outline">
                            Open PDF in new tab
                        </a>
                    </div>
                </div>
            </div>
        `;
    }

    handleRemoveFile(e) {
        e.preventDefault();
        
        this.selectedFile = null;
        
        this.resetUploadDisplay();
        
        const documentContent = document.querySelector('.document-content');
        if (documentContent) {
            documentContent.innerHTML = '';
        }
        
        const documentPreview = document.querySelector('.document-preview-container');
        if (documentPreview) {
            documentPreview.style.display = 'none';
        }
        
        const uploadCard = document.querySelector('.upload-card');
        const documentPanel = document.querySelector('.extractor-document-panel');
        if (uploadCard) {
            uploadCard.style.display = 'block';
        }
        if (documentPanel) {
            documentPanel.classList.add('upload-only');
        }
    }

    resetUploadDisplay() {
        const uploadCard = document.querySelector('.upload-card');
        const cardBody = uploadCard.querySelector('.card-body');
        
        cardBody.innerHTML = `
            <div class="upload-icon">
                <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 8l-4-4m0 0L8 8m4-4v12"/>
                </svg>
            </div>
            <div class="dashboard-card-title">Upload Document</div>
            <div class="dashboard-card-text">Drag and drop your file here</div>
            <button class="dashboard-btn dashboard-btn-primary upload-btn">Select File</button>
            <div class="dashboard-card-text" style="font-size:0.98rem;color:#888;margin-bottom:0;">PDF, PNG, JPG up to 10MB</div>
        `;
        
        const uploadBtn = cardBody.querySelector('.upload-btn');
        uploadBtn.addEventListener('click', (e) => this.handleUpload(e));
        
        this.setupDragAndDrop();
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    handleExtract(e) {
        e.preventDefault();
        
        if (!this.selectedFile) {
            alert('Please select a file first.');
            return;
        }

        const schemaConfig = this.getCurrentSchemaConfig();
        
        this.showExtractionLoading();
        
        this.saveExtractorTemplate(schemaConfig)
            .then(extractorId => {
                return this.performExtraction(extractorId, schemaConfig);
            })
            .catch(error => {
                this.hideExtractionLoading();
                console.error('Extraction error:', error);
                alert('Extraction failed. Please try again.');
            });
    }

    async saveExtractorTemplate(schemaConfig) {
        const timestamp = new Date().toISOString().split('T')[0];
        const fieldCount = schemaConfig.fields ? schemaConfig.fields.length : 0;
        const autoName = `Invoice_Extractor_${timestamp}_${fieldCount}fields`;
        
        const response = await fetch('/api/extractors', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: autoName,
                description: 'Invoice extraction template',
                schema: schemaConfig
            })
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to save extractor template');
        }
        
        console.log('Extractor template saved with ID:', data.extractor.id);
        return data.extractor.id;
    }

    async performExtraction(extractorId, schemaConfig) {
        const formData = new FormData();
        formData.append('file', this.selectedFile);
        formData.append('schema', JSON.stringify(schemaConfig));
        formData.append('extractor_id', extractorId);
        
        try {
            const response = await fetch('/api/extract', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            this.hideExtractionLoading();
            
            if (data.success) {
                this.renderExtractionResults(data.results);
            } else {
                alert('Extraction failed: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            this.hideExtractionLoading();
            throw error;
        }
    }

    getCurrentSchemaConfig() {
        const fields = [];
        
        document.querySelectorAll('.extractor-field-row').forEach((fieldRow, index) => {
            const fieldName = fieldRow.querySelector('.field-name').textContent.trim();
            const fieldType = fieldRow.querySelector('.field-type-badge').textContent.trim();
            const fieldDesc = fieldRow.querySelector('.field-description').textContent.trim();
            
            const field = {
                name: fieldName,
                type: fieldType,
                description: fieldDesc
            };
            
            if (fieldType === 'table') {
                const subfields = [];
                fieldRow.querySelectorAll('.subfield-wrapper').forEach(subfieldWrapper => {
                    const subfieldName = subfieldWrapper.querySelector('.subfield-name').textContent.trim();
                    const subfieldType = subfieldWrapper.querySelector('.subfield-type').textContent.trim();
                    const subfieldDesc = subfieldWrapper.querySelector('.subfield-description').textContent.trim();
                    
                    subfields.push({
                        name: subfieldName,
                        type: subfieldType,
                        description: subfieldDesc
                    });
                });
                field.subfields = subfields;
            }
            
            fields.push(field);
        });
        
        return { fields };
    }

    showExtractionLoading() {
        const extractBtn = document.querySelector('.extractor-bottom-bar .dashboard-btn-primary');
        extractBtn.disabled = true;
        extractBtn.innerHTML = `
            <svg class="animate-spin" width="16" height="16" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing...
        `;
    }

    hideExtractionLoading() {
        const extractBtn = document.querySelector('.extractor-bottom-bar .dashboard-btn-primary');
        extractBtn.disabled = false;
        extractBtn.innerHTML = 'Extract Document';
    }

    renderExtractionResults(results) {
    this.lastExtractionResults = results;
    this.switchToExtractedState();
    }

    switchToExtractedState() {
        const schemaPanel = document.querySelector('.extractor-schema-panel');
        if (!schemaPanel) return;
        
        if (!this.originalSchemaContent) {
            const panelClone = schemaPanel.cloneNode(true);
            panelClone.querySelectorAll('[data-listener-attached]').forEach(el => {
                el.removeAttribute('data-listener-attached');
            });
            this.originalSchemaContent = panelClone.innerHTML;
            console.log('Stored original schema content for restoration');
        }
        
        this.replaceWithExtractionUI();
    }

    replaceWithExtractionUI() {
        const schemaPanel = document.querySelector('.extractor-schema-panel');
        if (!schemaPanel) return;
        
        const extractionUI = `
            <div class="dashboard-card extraction-results-card">
                <div class="dashboard-title extraction-title">Extraction Results</div>
                <div class="extraction-subtitle">Document has been successfully processed</div>
                
                <!-- Extraction Results Container -->
                <div class="extraction-results-container">
                    <!-- Results will be populated here -->
                </div>
                
                <!-- Navigation Bar -->
                <div class="extractor-navigation-bar">
                    <button class="nav-btn nav-btn-secondary previous-btn">
                        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 12H5"/>
                            <path d="M12 19l-7-7 7-7"/>
                        </svg>
                        Previous
                    </button>
                    <button class="nav-btn nav-btn-primary next-btn">
                        Next
                        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M5 12h14"/>
                            <path d="M12 5l7 7-7 7"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
        
        schemaPanel.innerHTML = extractionUI;
        
        const previousBtn = schemaPanel.querySelector('.previous-btn');
        const nextBtn = schemaPanel.querySelector('.next-btn');
        
        if (previousBtn) {
            previousBtn.addEventListener('click', () => this.handlePreviousStep());
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.handleNextStep());
        }
        
        this.populateExtractionResults();
    }

    populateExtractionResults() {
        const resultsContainer = document.querySelector('.extraction-results-container');
        if (!resultsContainer || !this.lastExtractionResults) return;
        
        let resultsHTML = '';
        
        const schemaMapping = this.getSchemaFieldMapping();
        
        Object.entries(this.lastExtractionResults).forEach(([fieldName, value]) => {
            if (fieldName === 'line_items' && Array.isArray(value)) {
                resultsHTML += this.createTableResultHTML(fieldName, value, schemaMapping);
            } else {
                resultsHTML += this.createFieldResultHTML(fieldName, value, schemaMapping);
            }
        });
        
        resultsContainer.innerHTML = resultsHTML;
    }

    createFieldResultHTML(fieldName, value, schemaMapping = {}) {
        const displayName = fieldName;
        const displayValue = value !== null && value !== undefined && value !== '' 
            ? String(value) 
            : 'No value extracted';
        
        const hasValue = value !== null && value !== undefined && value !== '';
        
        return `
            <div class="extraction-field-result ${hasValue ? 'has-value' : 'no-value'}">
                <div class="field-result-header">
                    <span class="field-result-name">${displayName}</span>
                </div>
                <div class="field-result-value">${displayValue}</div>
            </div>
        `;
    }

    createTableResultHTML(fieldName, tableData, schemaMapping = {}) {
        const displayName = fieldName;
        
        if (!Array.isArray(tableData) || tableData.length === 0) {
            return `
                <div class="extraction-field-result no-value">
                    <div class="field-result-header">
                        <span class="field-result-name">${displayName}</span>
                    </div>
                    <div class="field-result-value">No table data extracted</div>
                </div>
            `;
        }
        
        const tableHTML = this.createTableHTML(tableData);
        
        return `
            <div class="extraction-field-result has-value table-result">
                <div class="field-result-header">
                    <span class="field-result-name">${displayName}</span>
                </div>
                <div class="field-result-table">
                    ${tableHTML}
                </div>
            </div>
        `;
    }

    formatFieldName(fieldName) {
        return fieldName
            .replace(/_/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    getSchemaFieldMapping() {
        const mapping = {};
        
        if (this.originalSchemaContent) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = this.originalSchemaContent;
            
            tempDiv.querySelectorAll('.extractor-field-row').forEach(fieldRow => {
                const fieldNameSpan = fieldRow.querySelector('.field-name');
                const fieldType = fieldRow.querySelector('.field-type-badge');
                
                if (fieldNameSpan && fieldType) {
                    const originalName = fieldNameSpan.textContent.trim();
                    const fieldTypeText = fieldType.textContent.trim().toLowerCase();
                    
                    if (originalName.toLowerCase().includes('invoice') && originalName.toLowerCase().includes('number')) {
                        mapping['invoice_number'] = originalName;
                    }
                    if (originalName.toLowerCase().includes('date')) {
                        mapping['invoice_date'] = originalName;
                    }
                    if (originalName.toLowerCase().includes('total') || originalName.toLowerCase().includes('amount')) {
                        mapping['total_amount'] = originalName;
                    }
                    if (originalName.toLowerCase().includes('vendor') || originalName.toLowerCase().includes('supplier')) {
                        mapping['vendor_name'] = originalName;
                    }
                    if (fieldTypeText === 'table' || originalName.toLowerCase().includes('item') || originalName.toLowerCase().includes('line')) {
                        mapping['line_items'] = originalName;
                    }
                }
            });
        }
        
        return mapping;
    }

    addNavigationBar() {
        const existingBottomBar = document.querySelector('.extractor-bottom-bar');
        if (existingBottomBar) {
            existingBottomBar.remove();
        }
        
        const navigationBar = document.createElement('div');
        navigationBar.className = 'extractor-navigation-bar';
        navigationBar.innerHTML = `
            <button class="nav-btn nav-btn-secondary previous-btn">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 12H5"/>
                    <path d="M12 19l-7-7 7-7"/>
                </svg>
                Previous
            </button>
            <button class="nav-btn nav-btn-primary next-btn">
                Next
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 12h14"/>
                    <path d="M12 5l7 7-7 7"/>
                </svg>
            </button>
        `;
        
        const schemaPanel = document.querySelector('.extractor-schema-panel');
        if (schemaPanel) {
            schemaPanel.appendChild(navigationBar);
        }
        
        const previousBtn = navigationBar.querySelector('.previous-btn');
        const nextBtn = navigationBar.querySelector('.next-btn');
        
        if (previousBtn) {
            previousBtn.addEventListener('click', () => this.handlePreviousStep());
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.handleNextStep());
        }
    }

    handlePreviousStep() {
        this.switchToEditingState();
    }

    handleNextStep() {
        alert('Export functionality will be implemented in the next phase.\n\nFeatures will include:\n- Export to JSON\n- Export to Excel\n- Export to CSV');
    }

    switchToEditingState() {
        const schemaPanel = document.querySelector('.extractor-schema-panel');
        if (schemaPanel && this.originalSchemaContent) {
            console.log('Restoring original schema content...');
            schemaPanel.innerHTML = this.originalSchemaContent;
            
            setTimeout(() => {
                console.log('DOM restored, initializing event listeners...');
                this.initializeAllEventListeners();
            }, 100);
        }
        
        this.lastExtractionResults = null;
    }

    initializeAllEventListeners() {
        console.log('Initializing all event listeners...');
        
        const allFields = document.querySelectorAll('.extractor-field-row');
        const allActionButtons = document.querySelectorAll('.action-btn, .save-btn, .cancel-btn');
        console.log(`Found ${allFields.length} fields and ${allActionButtons.length} action buttons`);
        
        this.setupCoreEventListeners();
        this.setupFieldActionEvents();
        this.setupTableFieldEvents();
        this.setupRemoveColumnEvents();
        this.setupRealTimeFieldEditing();
        
        console.log('All event listeners reinitialized after restoration');
    }

    restoreBottomBar() {
        const existingBottomBar = document.querySelector('.extractor-bottom-bar');
        if (existingBottomBar) {
            return; // Already exists
        }
        
        const bottomBar = document.createElement('div');
        bottomBar.className = 'extractor-bottom-bar';
        bottomBar.innerHTML = `
            <button class="dashboard-btn dashboard-btn-primary">Extract Document</button>
        `;
        
        const extractBtn = bottomBar.querySelector('.dashboard-btn-primary');
        if (extractBtn) {
            extractBtn.addEventListener('click', (e) => this.handleExtract(e));
        }
        
        const schemaPanel = document.querySelector('.extractor-schema-panel');
        if (schemaPanel) {
            schemaPanel.appendChild(bottomBar);
        }
    }

    clearExtractionResults() {
        document.querySelectorAll('.field-value-display').forEach(element => {
            element.remove();
        });
        
        document.querySelectorAll('.table-value-display').forEach(element => {
            element.remove();
        });
    }

    populateFieldsWithResults(results) {
        document.querySelectorAll('.extractor-field-row').forEach((fieldRow) => {
            const fieldNameElement = fieldRow.querySelector('.field-name');
            const fieldTypeElement = fieldRow.querySelector('.field-type-badge');
            
            if (!fieldNameElement || !fieldTypeElement) return;
            
            const fieldName = fieldNameElement.textContent.trim();
            const fieldType = fieldTypeElement.textContent.trim();
            
            if (results.hasOwnProperty(fieldName)) {
                const value = results[fieldName];
                
                if (fieldType === 'table') {
                    this.populateTableField(fieldRow, value);
                } else {
                    this.populateRegularField(fieldRow, value);
                }
            }
        });
    }

    populateRegularField(fieldRow, value) {
        let valueDisplay = fieldRow.querySelector('.field-value-display');
        
        if (!valueDisplay) {
            valueDisplay = document.createElement('div');
            valueDisplay.className = 'field-value-display';
            
            const fieldDescription = fieldRow.querySelector('.field-description');
            if (fieldDescription) {
                fieldDescription.parentNode.insertBefore(valueDisplay, fieldDescription.nextSibling);
            }
        }
        
        if (value === null || value === undefined || value === '') {
            valueDisplay.innerHTML = '<span class="no-value">No value extracted</span>';
            valueDisplay.className = 'field-value-display no-value';
        } else {
            valueDisplay.textContent = String(value);
            valueDisplay.className = 'field-value-display has-value';
        }
    }

    populateTableField(fieldRow, tableData) {
        let tableDisplay = fieldRow.querySelector('.table-value-display');
        
        if (!tableDisplay) {
            tableDisplay = document.createElement('div');
            tableDisplay.className = 'table-value-display';
            
            const tableSubfields = fieldRow.querySelector('.table-subfields');
            if (tableSubfields) {
                tableSubfields.parentNode.insertBefore(tableDisplay, tableSubfields.nextSibling);
            }
        }
        
        if (!Array.isArray(tableData) || tableData.length === 0) {
            tableDisplay.innerHTML = '<div class="no-table-data">No table data extracted</div>';
        } else {
            const tableHtml = this.createTableHTML(tableData);
            tableDisplay.innerHTML = tableHtml;
        }
        
        tableDisplay.className = 'table-value-display has-data';
    }

    createTableHTML(tableData) {
        if (!tableData || tableData.length === 0) {
            return '<div class="no-table-data">No data available</div>';
        }
        
        const headers = Object.keys(tableData[0]);
        
        let html = '<div class="extracted-table-wrapper">';
        html += '<table class="extracted-table">';
        
        html += '<thead><tr>';
        headers.forEach(header => {
            html += `<th>${this.formatHeaderName(header)}</th>`;
        });
        html += '</tr></thead>';
        
        html += '<tbody>';
        tableData.forEach(row => {
            html += '<tr>';
            headers.forEach(header => {
                const value = row[header];
                html += `<td>${value !== null && value !== undefined ? value : ''}</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody>';
        
        html += '</table></div>';
        return html;
    }

    formatHeaderName(header) {
        return header
            .replace(/_/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    showExtractionSuccess() {
        const notification = document.createElement('div');
        notification.className = 'extraction-success-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <svg class="success-icon" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>Document extracted successfully!</span>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    createResultsPanel(results) {
        const panel = document.createElement('div');
        panel.className = 'extractor-results-panel';
        panel.innerHTML = `
            <div class="dashboard-card extractor-results-card">
                <div class="dashboard-title results-title">
                    Extraction Results
                    <button class="dashboard-btn dashboard-btn-outline download-btn">Download JSON</button>
                </div>
                <div class="results-content">
                    ${this.renderResultsContent(results)}
                </div>
                <div class="results-actions-bar">
                    <button class="dashboard-btn dashboard-btn-outline results-back-btn">Back</button>
                    <button class="dashboard-btn dashboard-btn-primary results-next-btn" disabled>Next</button>
                </div>
            </div>
        `;
        const downloadBtn = panel.querySelector('.download-btn');
        downloadBtn.addEventListener('click', () => this.downloadResults(results));
        const backBtn = panel.querySelector('.results-back-btn');
        backBtn.addEventListener('click', () => this.handleResultsBack());
        return panel;
    }
    handleResultsBack() {
        const resultsPanel = document.querySelector('.extractor-results-panel');
        if (resultsPanel) resultsPanel.remove();
        const schemaPanel = document.querySelector('.extractor-schema-panel');
        if (schemaPanel) schemaPanel.scrollIntoView({ behavior: 'smooth' });
    }

    renderResultsContent(results) {
        let html = '';
        
        Object.entries(results).forEach(([fieldName, value]) => {
            html += `
                <div class="result-field">
                    <div class="result-field-header">
                        <strong>${fieldName}</strong>
                    </div>
                    <div class="result-field-value extracted-value">
                        ${this.formatResultValue(value)}
                    </div>
                </div>
            `;
        });
        
        return html;
    }

    formatResultValue(value) {
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
            const headers = Object.keys(value[0]);
            let table = '<table class="results-table"><thead><tr>';
            headers.forEach(h => {
                table += `<th>${h}</th>`;
            });
            table += '</tr></thead><tbody>';
            value.forEach(row => {
                table += '<tr>';
                headers.forEach(h => {
                    table += `<td>${row[h] ?? ''}</td>`;
                });
                table += '</tr>';
            });
            table += '</tbody></table>';
            return table;
        }
        if (Array.isArray(value)) {
            return value.map(v => `<span>${v}</span>`).join(', ');
        }
        if (value === null || value === undefined) {
            return '<span style="color:#888">(no value)</span>';
        }
        return `<span>${value}</span>`;
    }

    downloadResults(results) {
        const dataStr = JSON.stringify(results, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `extraction_results_${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
    }

    collapseAllFields() {
        document.querySelectorAll('.extractor-field-row.expanded').forEach(field => {
            field.classList.remove('expanded');
        });
        document.querySelectorAll('.field-editor').forEach(editor => {
            editor.style.display = 'none';
        });
    }

    setupTableFieldEvents() {
        document.querySelectorAll('.field-type-select').forEach(select => {
            if (!select.hasAttribute('data-listener-attached')) {
                select.addEventListener('change', (e) => this.handleFieldTypeChange(e));
                select.setAttribute('data-listener-attached', 'true');
            }
        });

        document.querySelectorAll('.add-column-btn').forEach(btn => {
            if (!btn.hasAttribute('data-listener-attached')) {
                btn.addEventListener('click', (e) => this.handleAddColumn(e));
                btn.setAttribute('data-listener-attached', 'true');
            }
        });

        document.querySelectorAll('.add-subfield-btn').forEach(btn => {
            if (!btn.hasAttribute('data-listener-attached')) {
                btn.addEventListener('click', (e) => this.handleAddSubfield(e));
                btn.setAttribute('data-listener-attached', 'true');
            }
        });

        this.setupRemoveColumnEvents();
    }

    setupTableFieldEventsForElement(element) {
        const typeSelect = element.querySelector('.field-type-select');
        if (typeSelect) {
            typeSelect.addEventListener('change', (e) => this.handleFieldTypeChange(e));
        }

        const addColumnBtn = element.querySelector('.add-column-btn');
        if (addColumnBtn) {
            addColumnBtn.addEventListener('click', (e) => this.handleAddColumn(e));
        }

        const addSubfieldBtn = element.querySelector('.add-subfield-btn');
        if (addSubfieldBtn) {
            addSubfieldBtn.addEventListener('click', (e) => this.handleAddSubfield(e));
        }

        element.querySelectorAll('.remove-column-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleRemoveColumn(e));
        });
    }

    handleFieldTypeChange(e) {
        const select = e.target;
        const fieldEditor = select.closest('.field-editor');
        const tableConfig = fieldEditor.querySelector('.table-config');
        const fieldRow = select.closest('.extractor-field-row');
        const fieldTypeSpan = fieldRow.querySelector('.field-type-badge');
        const tableSubfields = fieldRow.querySelector('.table-subfields');

        const isEditing = fieldRow.classList.contains('expanded');
        
        if (!isEditing && fieldTypeSpan) {
            this.updateFieldTypeDisplay(fieldTypeSpan, select.value);
        }

        if (select.value === 'table') {
            this.showTableConfiguration(tableConfig, tableSubfields, fieldRow);
        } else {
            this.hideTableConfiguration(tableConfig, tableSubfields, fieldRow);
        }
    }

    updateFieldTypeDisplay(span, type) {
        const isDark = document.body.classList.contains('dark');
        const typeColors = this.getTypeColors(type, isDark);
        
        span.style.background = typeColors.background;
        span.style.color = typeColors.color;
        span.textContent = type;
    }

    getTypeColors(type, isDark) {
        const colors = {
            text: {
                light: { background: '#dbeafe', color: '#1e40af' },
                dark: { background: '#1e3a8a', color: '#bfdbfe' }
            },
            number: {
                light: { background: '#dcfce7', color: '#15803d' },
                dark: { background: '#166534', color: '#bbf7d0' }
            },
            date: {
                light: { background: '#f3e8ff', color: '#7c3aed' },
                dark: { background: '#581c87', color: '#e9d5ff' }
            },
            table: {
                light: { background: '#e0e7ff', color: '#4338ca' },
                dark: { background: '#312e81', color: '#c7d2fe' }
            }
        };

        return isDark ? colors[type]?.dark : colors[type]?.light;
    }

    showTableConfiguration(tableConfig, tableSubfields, fieldRow) {
        if (tableConfig) tableConfig.style.display = 'block';
        
        if (!tableSubfields) {
            this.createTableSubfields(fieldRow);
        } else {
            tableSubfields.style.display = 'block';
        }
        
        fieldRow.classList.add('table-field');
    }

    hideTableConfiguration(tableConfig, tableSubfields, fieldRow) {
        if (tableConfig) tableConfig.style.display = 'none';
        if (tableSubfields) {
            tableSubfields.remove();
        }

        const tableColumns = fieldRow.querySelector('.table-columns');
        if (tableColumns) {
            tableColumns.innerHTML = '';
        }

        fieldRow.classList.remove('table-field');
    }

    createTableSubfields(fieldRow) {
        const tableSubfieldsHtml = `
            <div class="table-subfields">
                <div class="table-columns-title">Table Columns:</div>
                <div class="subfields-container">
                    <button class="add-subfield-btn">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 5l0 14"/>
                            <path d="M5 12l14 0"/>
                        </svg>
                        Add Table Column
                    </button>
                </div>
            </div>
        `;
        
        fieldRow.querySelector('.field-editor').insertAdjacentHTML('beforebegin', tableSubfieldsHtml);
        this.setupTableFieldEvents();
        this.reinitializeEventListeners();
        this.applyThemeStyles();
    }

    handleAddColumn(e) {
        e.preventDefault();
        const fieldEditor = e.target.closest('.field-editor');
        const tableColumns = fieldEditor.querySelector('.table-columns');
        
        const newColumnHtml = this.createColumnConfigHtml();
        tableColumns.insertAdjacentHTML('beforeend', newColumnHtml);
        
        const newColumnRow = tableColumns.querySelector('.table-column-row:last-child');
        if (newColumnRow) {
            const removeBtn = newColumnRow.querySelector('.remove-column-btn');
            if (removeBtn) {
                removeBtn.addEventListener('click', (e) => this.handleRemoveColumnConfig(e));
            }
        }
        
        this.applyThemeStyles();
    }

    handleAddSubfield(e) {
        e.preventDefault();
               const subfieldsContainer = e.target.closest('.subfields-container');
        const fieldRow = e.target.closest('.extractor-field-row');
        const tableColumns = fieldRow.querySelector('.table-columns');

        const newSubfieldHtml = this.createSubfieldHtml();
        e.target.insertAdjacentHTML('beforebegin', newSubfieldHtml);

        if (tableColumns) {
            const newColumnHtml = this.createColumnConfigHtml();
            tableColumns.insertAdjacentHTML('beforeend', newColumnHtml);
            
            const newColumnRow = tableColumns.querySelector('.table-column-row:last-child');
            if (newColumnRow) {
                const removeBtn = newColumnRow.querySelector('.remove-column-btn');
                if (removeBtn) {
                    removeBtn.addEventListener('click', (e) => this.handleRemoveColumn(e));
                }
            }
        }

        const newSubfieldWrapper = subfieldsContainer.querySelector('.subfield-wrapper:last-of-type');
        if (newSubfieldWrapper) {
            const deleteBtn = newSubfieldWrapper.querySelector('.delete-subfield-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => this.handleDeleteSubfield(e));
            }
        }

        this.applyThemeStyles();

        setTimeout(() => {
            const newNameInput = tableColumns?.querySelector('.table-column-row:last-child .column-name-input');
            if (newNameInput) {
                this.updateTableDisplay(newNameInput);
            }
        }, 100);
    }

    createSubfieldHtml() {
        return `
            <div class="subfield-wrapper">
                <div class="subfield-row">
                    <div>
                        <span class="subfield-name">new_column</span>
                        <span class="subfield-type text">text</span>
                    </div>
                    <button class="column-delete-btn delete-subfield-btn" data-subfield="new_column" title="Remove Column">×</button>
                </div>
                <div class="subfield-description">New table column description</div>
            </div>
        `;
    }

    createColumnConfigHtml() {
        return `
            <div class="table-column-row">
                <div class="column-input-group">
                    <label class="column-label">Column Name</label>
                    <input type="text" class="form-control column-name-input" value="new_column">
                    <label class="column-label">Description</label>
                    <input type="text" class="form-control column-description-input" value="New table column description" placeholder="Enter column description...">
                </div>
                <div class="column-type-group">
                    <label class="column-label">Type</label>
                    <select class="form-control column-type-select">
                        <option value="text" selected>Text</option>
                        <option value="number">Number</option>
                        <option value="date">Date</option>
                    </select>
                </div>
                <div class="column-actions">
                    <button type="button" class="column-delete-btn remove-column-btn">×</button>
                </div>
            </div>
        `;
    }

    updateTableDisplay(element) {
        const columnRow = element.closest('.table-column-row');
        const fieldRow = element.closest('.extractor-field-row');
        const columnIndex = Array.from(columnRow.parentNode.children).indexOf(columnRow);
        const subfieldsContainer = fieldRow.querySelector('.subfields-container');

        if (subfieldsContainer) {
            const subfieldWrappers = subfieldsContainer.querySelectorAll('.subfield-wrapper');
            const targetWrapper = subfieldWrappers[columnIndex];

            if (targetWrapper) {
                this.syncSubfieldDisplay(columnRow, targetWrapper);
            }
        }
    }

    syncSubfieldDisplay(columnRow, targetWrapper) {
        const nameInput = columnRow.querySelector('.column-name-input');
        const descriptionInput = columnRow.querySelector('.column-description-input');
        const typeSelect = columnRow.querySelector('.column-type-select');
        
        const nameSpan = targetWrapper.querySelector('.subfield-name');
        const descriptionDiv = targetWrapper.querySelector('.subfield-description');
        const typeSpan = targetWrapper.querySelector('.subfield-type');

        if (nameInput && nameSpan) {
            nameSpan.textContent = nameInput.value || 'column_name';
        }

        if (descriptionInput && descriptionDiv) {
            descriptionDiv.textContent = descriptionInput.value || 'Column description';
        }

        if (typeSelect && typeSpan) {
            const type = typeSelect.value;
            typeSpan.textContent = type;
            typeSpan.className = `subfield-type ${type}`;
            
            const isDark = document.body.classList.contains('dark');
            const colors = this.getTypeColors(type, isDark);
            if (colors) {
                typeSpan.style.setProperty('color', colors.color, );
            }
        }
    }

    setupRemoveColumnEvents() {
        document.querySelectorAll('.remove-column-btn').forEach(btn => {
            if (!btn.hasAttribute('data-listener-attached')) {
                btn.addEventListener('click', (e) => this.handleRemoveColumn(e));
                btn.setAttribute('data-listener-attached', 'true');
            }
        });

        document.querySelectorAll('.delete-subfield-btn').forEach(btn => {
            if (!btn.hasAttribute('data-listener-attached')) {
                btn.addEventListener('click', (e) => this.handleDeleteSubfield(e));
                btn.setAttribute('data-listener-attached', 'true');
            }
        });
    }

    handleRemoveColumn(e) {
        e.preventDefault();
        const columnRow = e.target.closest('.table-column-row');
        const fieldRow = e.target.closest('.extractor-field-row');
        const columnIndex = Array.from(columnRow.parentNode.children).indexOf(columnRow);

        columnRow.remove();

        const subfieldsContainer = fieldRow.querySelector('.subfields-container');
        if (subfieldsContainer) {
            const subfieldWrappers = subfieldsContainer.querySelectorAll('.subfield-wrapper');
            if (subfieldWrappers[columnIndex]) {
                subfieldWrappers[columnIndex].remove();
            }
        }
    }

    handleRemoveColumnConfig(e) {
        e.preventDefault();
        const columnRow = e.target.closest('.table-column-row');
        columnRow.remove();
    }

    handleDeleteSubfield(e) {
        e.preventDefault();
        if (confirm('Remove this table column?')) {
            const subfieldWrapper = e.target.closest('.subfield-wrapper');
            const fieldRow = e.target.closest('.extractor-field-row');
            const subfieldsContainer = fieldRow.querySelector('.subfields-container');
            const subfieldIndex = Array.from(subfieldsContainer.querySelectorAll('.subfield-wrapper')).indexOf(subfieldWrapper);

            subfieldWrapper.remove();

            const tableColumns = fieldRow.querySelector('.table-columns');
            if (tableColumns) {
                const columnRows = tableColumns.querySelectorAll('.table-column-row');
                if (columnRows[subfieldIndex]) {
                    columnRows[subfieldIndex].remove();
                }
            }
        }
    }

    reinitializeEventListeners() {
        this.clearDuplicateListeners();
        
        this.setupCoreEventListeners();
        this.setupFieldActionEvents();
        this.setupRemoveColumnEvents();
        this.setupTableFieldEvents();
        this.setupRealTimeFieldEditing();
    }

    clearDuplicateListeners() {
        const elementsToClone = [
            '.extractor-add-field-btn',
            '.extractor-bottom-bar .dashboard-btn-primary',
            '.field-name-input',
            '.field-desc-input'
        ];

        elementsToClone.forEach(selector => {
            document.querySelectorAll(selector).forEach(element => {
                if (element.parentNode) {
                    const newElement = element.cloneNode(true);
                    element.parentNode.replaceChild(newElement, element);
                }
            });
        });
    }

    setupCoreEventListeners() {
        const addFieldBtn = document.querySelector('.extractor-add-field-btn');
        if (addFieldBtn && !addFieldBtn.hasAttribute('data-listener-attached')) {
            addFieldBtn.addEventListener('click', (e) => this.handleAddField(e));
            addFieldBtn.setAttribute('data-listener-attached', 'true');
        }

        const extractBtn = document.querySelector('.extractor-bottom-bar .dashboard-btn-primary');
        if (extractBtn && !extractBtn.hasAttribute('data-listener-attached')) {
            extractBtn.addEventListener('click', (e) => this.handleExtract(e));
            extractBtn.setAttribute('data-listener-attached', 'true');
        }
    }

    setupFieldActionEvents() {
        const buttons = document.querySelectorAll('.action-btn, .save-btn, .cancel-btn');
        console.log(`Setting up field action events for ${buttons.length} buttons`);
        
        buttons.forEach((btn, index) => {
            if (!btn.hasAttribute('data-listener-attached')) {
                console.log(`Attaching listener to button ${index} (${btn.dataset.action})`);
                
                const clickHandler = (e) => {
                    console.log(`Button clicked: ${btn.dataset.action} for field ${btn.dataset.idx}`);
                    this.handleFieldAction(e);
                };
                
                btn.addEventListener('click', clickHandler);
                btn.setAttribute('data-listener-attached', 'true');
            } else {
                console.log(`Button ${index} already has listener attached`);
            }
        });
    }

    applyThemeStyles() {
        const isDark = document.body.classList.contains('dark');

        const uploadCard = document.querySelector('.upload-card');
        if (uploadCard) {
            uploadCard.style.background = isDark ? '#2C394B' : '#fff';
            uploadCard.style.color = isDark ? '#fff' : '#222';
        }

        document.querySelectorAll('span[style*="border-radius:12px"]').forEach(span => {
            const text = span.textContent.toLowerCase();
            const colors = this.getTypeColors(text, isDark);
            if (colors) {
                span.style.color = colors.color + ' !important';
            }
        });

        document.querySelectorAll('.subfield-type').forEach(span => {
            const text = span.textContent.toLowerCase();
            const colors = this.getTypeColors(text, isDark);
            if (colors) {
            }
        });
    }

    setupThemeObserver() {
        const currentTheme = localStorage.getItem("theme");
        
        if (currentTheme === "dark") {
            if (!document.body.classList.contains('dark')) {
                document.body.classList.add('dark');
                this.applyThemeStyles();
            }
        } else if (currentTheme === "light") {
            if (document.body.classList.contains('dark')) {
                document.body.classList.remove('dark');
                this.applyThemeStyles();
            }
        }
        else if (!currentTheme && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
            if (!document.body.classList.contains('dark')) {
                document.body.classList.add('dark');
                this.applyThemeStyles();
            }
        }

        window.addEventListener('storage', (e) => {
            if (e.key === 'theme') {
                if (e.newValue === 'dark') {
                    document.body.classList.add('dark');
                } else {
                    document.body.classList.remove('dark');
                }
                this.applyThemeStyles();
            }
        });

        const observer = new MutationObserver(() => {
            this.applyThemeStyles();
        });
        observer.observe(document.body, { attributes: true });
    }
}


document.addEventListener('DOMContentLoaded', () => {
    window.extractorManager = new ExtractorManager();
});


window.updateTableDisplay = function(element) {
    if (window.extractorManager) {
        window.extractorManager.updateTableDisplay(element);
    }
};
