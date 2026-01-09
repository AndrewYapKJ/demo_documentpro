from datetime import datetime
import uuid
from apps import db


class Extractor(db.Model):
    __tablename__ = 'extractors'

    id = db.Column(db.Integer, primary_key=True)
    # uid: unique identifier generated on create (exposed to clients)
    uid = db.Column(db.String(36), unique=True, nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, index=True)
    name = db.Column(db.String(256), nullable=False)
    description = db.Column(db.Text, nullable=True)
    schema = db.Column(db.JSON, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'uid': self.uid,
            'user_id': self.user_id,
            'name': self.name,
            'description': self.description,
            'schema': self.schema,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f"<Extractor id={self.id} uid={self.uid} name={self.name}>"

    @staticmethod
    def generate_uid():
        """Generate a short UUID string for the extractor uid."""
        return str(uuid.uuid4())
