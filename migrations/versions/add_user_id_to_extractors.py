"""add user_id to extractors

Revision ID: a1b2c3d4e5f6
Revises: e968c10d3931
Create Date: 2025-11-19 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = 'e968c10d3931'
branch_labels = None
depends_on = None


def upgrade():
    # Add user_id column to extractors table
    with op.batch_alter_table('extractors', schema=None) as batch_op:
        batch_op.add_column(sa.Column('user_id', sa.Integer(), nullable=True))
        batch_op.create_index('ix_extractors_user_id', ['user_id'], unique=False)
        batch_op.create_foreign_key('fk_extractors_user_id', 'users', ['user_id'], ['id'])


def downgrade():
    # Remove user_id column from extractors table
    with op.batch_alter_table('extractors', schema=None) as batch_op:
        batch_op.drop_constraint('fk_extractors_user_id', type_='foreignkey')
        batch_op.drop_index('ix_extractors_user_id')
        batch_op.drop_column('user_id')
