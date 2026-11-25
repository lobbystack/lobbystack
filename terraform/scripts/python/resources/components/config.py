import os
import re

# A subscription id, such as 00000000-0000-0000-0000-000000000000.
GUID = re.compile(r"^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$")

# resources/ directory (parent of this components/ package)
RESOURCES_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# scripts/python/ directory
SCRIPT_DIR = os.path.dirname(RESOURCES_DIR)
# terraform/ directory, two levels above scripts/python/
TERRAFORM_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
ENVIRONMENTS_DIR = os.path.join(TERRAFORM_DIR, "environments")
IMPORT_DIR = os.path.join(RESOURCES_DIR, "import")

# Plans hold sensitive values, such as the OpenAI project id, so they are gitignored (*.tfplan).
PLAN_FILE = os.path.join(TERRAFORM_DIR, "deploy.tfplan")
DRIFT_PLAN_FILE = os.path.join(TERRAFORM_DIR, "drift.tfplan")

# dev's state was created before workspaces, so it stays in the default workspace. Every other environment has a
# workspace named after it. See README.md.
DEFAULT_WORKSPACE_ENVIRONMENT = "dev"
_ORDER = ["dev", "prod"]

# Required for Git Bash on Windows to prevent path mangling in -var arguments
os.environ["MSYS_NO_PATHCONV"] = "1"
# Keeps the Azure CLI from stopping to ask about an upgrade in the middle of a run
os.environ.setdefault("AZURE_AUTO_UPGRADE_ENABLE", "no")


def list_environments() -> list[str]:
    """The environments that have a tfvars file, in the order dev, prod, then any others."""
    if not os.path.isdir(ENVIRONMENTS_DIR):
        return []
    found = [f[: -len(".tfvars")] for f in os.listdir(ENVIRONMENTS_DIR) if f.endswith(".tfvars")]
    return sorted(found, key=lambda name: (_ORDER.index(name) if name in _ORDER else len(_ORDER), name))


def var_file(environment: str) -> str:
    return f"./environments/{environment}.tfvars"


def workspace_for(environment: str) -> str:
    return "default" if environment == DEFAULT_WORKSPACE_ENVIRONMENT else environment


def resource_group_name(environment: str) -> str:
    """The environment's resource group, {app_name}-resource-group-{environment}, as modules/resource_group names it."""
    app_name = read_tfvar(environment, "app_name")
    return f"{app_name}-resource-group-{environment}" if app_name else ""


def read_tfvar(environment: str, key: str) -> str:
    """A simple `key = "value"` setting from the environment's tfvars file, or an empty string."""
    path = os.path.join(ENVIRONMENTS_DIR, f"{environment}.tfvars")
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                match = re.match(rf'^\s*{re.escape(key)}\s*=\s*"([^"]*)"', line)
                if match:
                    return match.group(1)
    except OSError:
        pass
    return ""
