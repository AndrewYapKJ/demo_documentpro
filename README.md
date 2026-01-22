### 1. Install Python and Flask

Make sure Python is installed:
```bash
python3 --version
```

### 2. Create Virtual Environment

```bash
python3 -m venv venv
```

### 3. Activate Virtual Environment

**macOS/Linux:**
```bash
source venv/bin/activate
```

**Windows:**
```cmd
venv\Scripts\activate
```

### 4. Install Requirements

```bash
pip install -r requirements.txt
```

### 5. Configure Environment

Copy and edit the `.env` file with your SQL Server credentials:
```bash
cp .env.sample .env
```

Edit `.env` and update the `DATABASE_URL` with your SQL Server password.

### 6. Initialize Database

Run the database migrations:
```bash
flask db upgrade
```

Or use the init script:
```bash
python init_db.py
```

### 7. Run the Application

Start the Flask development server:
```bash
flask run
```

The application will be available at: **http://127.0.0.1:5000**

## Common Commands

| Command | Description |
|---------|-------------|
| `flask run` | Start development server |
| `flask db upgrade` | Apply database migrations |
| `flask db migrate -m "message"` | Create new migration |
| `python init_db.py` | Initialize database tables |

## Troubleshooting

### Port Already in Use
If port 5000 is already in use:
```bash
flask run --port 5001
```

### Database Connection Issues
1. Verify SQL Server is running
2. Check credentials in `.env` file
3. Ensure ODBC Driver 18 is installed
4. Test connection: `sqlcmd -S localhost,1433 -U sa -P <your-password> -C`

### Package Installation Issues
If you encounter package conflicts:
```bash
pip install --upgrade pip
pip install -r requirements.txt --force-reinstall
```

