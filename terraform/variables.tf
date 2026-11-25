variable "subscription_id" {
  description = "The Azure subscription to create everything in. Each environment sets its own in environments/<environment>.tfvars: dev and sandbox use the NPD subscription and prod uses the PRD one. Null uses ARM_SUBSCRIPTION_ID, or the one `az login` selected, which is why the environment files always set it."
  type        = string
  default     = null

  validation {
    condition     = var.subscription_id == null || can(regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", var.subscription_id))
    error_message = "subscription_id is a subscription's id, such as 00000000-0000-0000-0000-000000000000. For prod, put the PRD subscription's id in environments/prod.tfvars."
  }
}

variable "environment" {
  description = "Which environment this is: dev, sandbox or prod. It goes into every resource's tags and picks the workspace that holds its state. Set it in environments/<environment>.tfvars."
  type        = string

  validation {
    condition     = contains(["dev", "sandbox", "prod"], var.environment)
    error_message = "The environment is dev, sandbox or prod."
  }
}

variable "location" {
  description = "The Azure region. Pick one close to your callers that accepts new resources for your subscription: Azure refuses some regions, such as westeurope and germanywestcentral for newer subscriptions. polandcentral is close to Serbia. README.md shows how to check a region."
  type        = string
  default     = "polandcentral"
}

variable "app_name" {
  description = "The application's name, which names everything: the resource group is {app_name}-resource-group-{environment}, such as lobbystack-sip-resource-group-dev, and the resources inside start with {app_name}. Set it in environments/<environment>.tfvars."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$", var.app_name))
    error_message = "app_name is lowercase letters, digits and hyphens, from 3 to 42 characters, and starts and ends with a letter or digit."
  }
}

variable "vm_size" {
  description = "The VM size. The server only passes G.711 audio through, so two vCPUs and 4 GB carry a few calls and build the Docker image. The default is the cheapest burstable size that fits. A size needs two things: the region offers it, and your subscription has vCPU quota for its family there. A new subscription often has none for the B-series, and Standard_D2als_v6 is a general purpose size that works without a request. README.md shows how to check."
  type        = string
  default     = "Standard_B2ls_v2"
}

variable "dns_label" {
  description = "A name for the VM's public address, giving <label>.<region>.cloudapp.azure.com. Null gives none. It must be unique in the region."
  type        = string
  default     = null
}

variable "admin_username" {
  description = "The VM's administrator account."
  type        = string
  default     = "azureuser"
}

variable "ssh_public_key" {
  description = "The SSH public key that logs in as the administrator, such as the contents of ~/.ssh/id_ed25519.pub. The VM has no password login."
  type        = string
}

variable "ssh_allowed_cidrs" {
  description = "Addresses allowed to reach SSH on port 22, such as [\"203.0.113.7/32\"]. Empty opens no SSH at all."
  type        = list(string)
  default     = []

  validation {
    condition     = !contains(var.ssh_allowed_cidrs, "0.0.0.0/0") && !contains(var.ssh_allowed_cidrs, "*")
    error_message = "Don't open SSH to the whole internet. List the addresses that need it."
  }
}

variable "openai_project_id" {
  description = "Your OpenAI project id (proj_...), the same as OPENAI_PROJECT_ID on the worker."
  type        = string
  sensitive   = true

  validation {
    condition     = startswith(var.openai_project_id, "proj_")
    error_message = "The OpenAI project id starts with proj_."
  }
}

variable "carrier_ips" {
  description = "The carrier's SIP server addresses, such as Zadarma's. Only they may reach SIP and audio. Empty leaves the server closed to every carrier until you set them."
  type        = list(string)
  default     = []

  validation {
    condition     = !contains(var.carrier_ips, "0.0.0.0/0") && !contains(var.carrier_ips, "*")
    error_message = "Don't open SIP to the whole internet. List the carrier's addresses."
  }
}

variable "openai_media_cidrs" {
  description = "The addresses OpenAI sends and takes audio from, from its SIP guide. Check them against the current list."
  type        = list(string)
  default = [
    "13.79.45.80/28",
    "20.204.17.112/28",
    "23.98.140.64/28",
    "40.67.149.176/28",
    "40.83.204.240/28",
  ]
}

variable "rtp_start" {
  description = "The first UDP port audio uses."
  type        = number
  default     = 10000
}

variable "rtp_end" {
  description = "The last UDP port audio uses. Each call takes two ports."
  type        = number
  default     = 10200
}

variable "default_country_code" {
  description = "The country code, without the plus, added to a caller number that starts with 0. 381 is Serbia."
  type        = string
  default     = "381"
}

variable "caller_header" {
  description = "The SIP header that holds the caller's number, when it isn't P-Asserted-Identity, Remote-Party-ID or From. Empty otherwise."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags for every resource."
  type        = map(string)
  default     = {}
}

variable "deploy_app" {
  description = "Whether to create the web app's VM beside the SIP server: the dashboard, the worker, Postgres and Redis, run by Docker Compose and served over HTTPS on app_domain. It adds a VM, a disk and a static address, so an environment turns it on in environments/<environment>.tfvars."
  type        = bool
  default     = false
}

variable "app_domain" {
  description = "The domain the web app answers on, such as dev.lobbystack.com or lobbystack.com. The output app_dns_records lists the records to create at the registrar. Caddy gets the certificate by itself once they resolve."
  type        = string
  default     = ""

  validation {
    condition     = var.app_domain == "" || can(regex("^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,}$", var.app_domain))
    error_message = "app_domain is a lowercase host name such as lobbystack.com or dev.lobbystack.com, with no https:// and no path."
  }
}

variable "app_vm_size" {
  description = "The web app's VM size. Postgres, Redis, the admin, the worker and the image build share it, so it needs 8 GB. Standard_D2as_v6 is 2 vCPUs and 8 GB, and a subscription has quota for its family without a request. The B-series family the SIP server uses is full at two vCPUs."
  type        = string
  default     = "Standard_D2as_v6"
}

variable "app_os_disk_size_gb" {
  description = "The web app's OS disk in GB. It holds the images, Postgres's data and the uploaded files."
  type        = number
  default     = 64
}

variable "app_repository_url" {
  description = "The git repository the web app VM clones on its first boot. It has to be readable without a password."
  type        = string
  default     = "https://github.com/MilanObrenovic/lobbystack.git"
}

variable "app_repository_ref" {
  description = "The branch or tag the web app VM clones, and that lobbystack-update checks out again."
  type        = string
  default     = "main"
}
