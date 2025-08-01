# EpicStaff Installer

A Docker container management tool for EpicStaff.

## Installation

```bash
poetry install
```

## Development

To build the application:

```bash
# Build the executable
pyinstaller installer.py --name epicstaff.exe --onefile --add-data 'app/templates:app/templates' --add-data 'app/static:app/static' --add-data '../src/docker-compose.yaml:app/static/run_program' --add-data '../frontend-config:app/static/run_program/frontend-config' --add-data '../src/.env:app/static/run_program' --hidden-import engineio.async_drivers.threading --distpath ../artifacts/windows --windowed
# Run the built executable
./dist/epicstaff
```