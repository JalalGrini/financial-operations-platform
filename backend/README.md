# Backend README
# Financial Operations Platform - Backend

## Setup

1. Create and activate virtual environment:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate  # Windows
   # source .venv/bin/activate  # Linux/macOS
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy environment example and configure:
   ```bash
   cp .env.example .env
   # Edit .env with your PostgreSQL credentials
   ```

4. Create PostgreSQL database:
   ```sql
   CREATE DATABASE financial_ops;
   CREATE USER financial_ops_user WITH PASSWORD 'your-password';
   GRANT ALL PRIVILEGES ON DATABASE financial_ops TO financial_ops_user;
   ```

5. Run migrations:
   ```bash
   python manage.py migrate
   ```

6. Create superuser (optional):
   ```bash
   python manage.py createsuperuser
   ```

7. Run development server:
   ```bash
   python manage.py runserver
   ```

## Commands

- Format code: `black . && isort .`
- Lint code: `ruff check .`
- Type check: `mypy .`
- Run tests: `pytest`
- Run tests with coverage: `pytest --cov=apps --cov=config`
- Make migrations: `python manage.py makemigrations`
- Apply migrations: `python manage.py migrate`
- Check Django config: `python manage.py check`

## Project Structure

```
backend/
├── manage.py
├── config/
│   ├── __init__.py
│   ├── asgi.py
│   ├── wsgi.py
│   ├── urls.py
│   ├── api_urls.py
│   ├── exceptions.py
│   └── settings/
│       ├── __init__.py
│       ├── base.py
│       ├── development.py
│       └── production.py
├── apps/
│   ├── __init__.py
│   ├── common/
│   │   ├── __init__.py
│   │   ├── apps.py
│   │   ├── models.py
│   │   ├── managers.py
│   │   └── tests/
│   │       ├── __init__.py
│   │       └── test_models.py
│   └── accounts/
│       ├── __init__.py
│       ├── apps.py
│       ├── models.py
│       ├── managers.py
│       ├── admin.py
│       ├── urls.py
│       └── tests/
│           ├── __init__.py
│           └── test_models.py
├── requirements/
│   ├── base.txt
│   ├── development.txt
│   └── production.txt
├── requirements.txt
├── .env.example
├── pytest.ini
└── pyproject.toml
```