# EpicStaff – Hybrid Setup Guide (Local + Docker)
---

## 1. Clone the Repository
```powershell
git clone https://github.com/EpicStaff/EpicStaff.git
cd EpicStaff
```

---

## 2. Prerequisites

- **Visual Studio Build Tools**  
  During installation, select: **Desktop development with C++**

- **Docker Desktop**  
  Must be installed and running

---

## 3. Allow PowerShell Script Execution
Run PowerShell **as Administrator**:

```powershell
Get-ExecutionPolicy
```

If not `RemoteSigned`, then run:
```powershell
Set-ExecutionPolicy RemoteSigned
```

---

## 4. Python Setup
You must have Python version 3.12 installed (otherwise you will encounter errors).
If you have multiple Python versions installed, make sure to use python3.12 instead of python when creating a virtual environment for each service, for example:

```powershell
python3.12 -m venv venv
```
Next step:
```powershell
python.exe -m pip install --upgrade pip
cd src
```

---

## 5. Start Infrastructure (Docker)

Create required Docker volumes:
```powershell
docker volume create sandbox_venvs; docker volume create sandbox_executions; docker volume create crew_pgdata; docker volume create crew_config
```

Start the core infrastructure containers:
```powershell
    docker compose up --build
```

After that, you can manually stop any containers you prefer to run locally:
```powershell
    docker stop <container_name_or_id>
```

Alternatively, you can stop them directly from Docker Desktop.


## 6. Environment Configuration (Global .env)
In the `/src` directory, locate the single `.env` file.  
Add the following variables if they are missing, or update them if they already exist:
```env
DB_NAME=crew
DB_HOST_NAME=127.0.0.1
REDIS_HOST=127.0.0.1
MANAGER_PORT=8001
```

# Running Backend Services Locally  
⚠️ **Reminder:** Each service must be started in a **new terminal**.

---

### 🔹 1. Crew
```powershell
cd crew
python -m venv venv
venv\Scripts\activate
pip install poetry
poetry install
python main.py
```

---

### 🔹 2. Django App
```powershell
cd src/django_app
python -m venv venv
venv\Scripts\activate
pip install poetry
poetry install
.\entrypoint_debug.ps1
```

---

### 🔹 3. Knowledge
```powershell
cd src/knowledge
python -m venv venv
venv\Scripts\activate
pip install poetry 
poetry install --no-root
python main.py
```

---

### 🔹 4. Sandbox
```powershell
cd src/sandbox
python -m venv venv
venv\Scripts\activate
pip install poetry
poetry install
mkdir savefiles
```

Fix dependency path in `src/sandbox/dynamic_venv_executor_chain.py`:
```python
predefined_libraries = {"../../shared/dotdict"}
```

Run:
```powershell
python main.py
```

---

### 🔹 5. Realtime
```powershell
cd src/realtime
python -m venv venv
venv\Scripts\activate
pip install poetry
poetry install
python run_server.py
```

---

### 🔹 6. Manager
```powershell
cd src/manager
python -m venv venv
venv\Scripts\activate
pip install poetry
poetry install --no-root
python app.py
```