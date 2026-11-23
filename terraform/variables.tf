variable "subscription_id" {
  description = "The Azure subscription to create everything in. Null uses ARM_SUBSCRIPTION_ID, or the one `az login` selected."
  type        = string
  default     = null
}

variable "location" {
  description = "The Azure region. Pick one close to your callers that accepts new resources for your subscription: Azure refuses some regions, such as westeurope and germanywestcentral for newer subscriptions. polandcentral is close to Serbia. README.md shows how to check a region."
  type        = string
  default     = "polandcentral"
}

variable "name_prefix" {
  description = "A prefix for every resource's name."
  type        = string
  default     = "lobbystack-sip"
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
