your_project/
├─ manage.py
├─ requirements.txt
├─ config/
│  ├─ __init__.py
│  ├─ settings.py
│  ├─ urls.py
│  ├─ asgi.py
│  └─ wsgi.py
├─ accounts/
│  ├─ __init__.py
│  ├─ apps.py
│  ├─ admin.py
│  ├─ forms.py
│  ├─ models.py
│  └─ migrations/
│     └─ __init__.py
├─ core/
│  ├─ __init__.py
│  ├─ apps.py
│  ├─ admin.py
│  ├─ models/
│  │  ├─ __init__.py
│  │  ├─ base.py
│  │  └─ project.py
│  └─ migrations/
│     └─ __init__.py




# From the folder that has manage.py
rm -f db.sqlite3                           # or drop your DB if using Postgres/MySQL
python manage.py migrate                   # applies accounts first, then admin
python manage.py createsuperuser
python manage.py runserver




