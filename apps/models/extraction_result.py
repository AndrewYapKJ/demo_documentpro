from datetime import datetime
from apps import db
import json


class ExtractionResult(db.Model):
    __tablename__ = 'extraction_results'

    id = db.Column(db.Integer, primary_key=True)
    extractor_id = db.Column(db.Integer, db.ForeignKey('extractors.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True) 
    filename = db.Column(db.String(512), nullable=True)
    file_size = db.Column(db.Integer, nullable=True)
    file_type = db.Column(db.String(100), nullable=True)
    extracted_data = db.Column(db.Text, nullable=False)  # JSON stored as string
    extraction_method = db.Column(db.String(100), nullable=True, default='openai')
    status = db.Column(db.String(50), nullable=True, default='completed')
    error_message = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=True, default=datetime.utcnow)
    
    # Property to handle JSON data conversion
    @property  
    def data(self):
        """Return extracted_data as JSON object"""
        try:
            return json.loads(self.extracted_data) if self.extracted_data else {}
        except:
            return {}
    
    @data.setter
    def data(self, value):
        """Set extracted_data from JSON object"""
        self.extracted_data = json.dumps(value) if value else '{}'

    def __repr__(self):
        return f"<ExtractionResult id={self.id} filename={self.filename} extractor_id={self.extractor_id} created_at={self.created_at}>"
