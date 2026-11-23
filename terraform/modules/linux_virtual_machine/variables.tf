variable "app_name" {
  description = "The application name, the first part of the resource's name."
  type        = string
}

variable "environment" {
  description = "The environment, the last part of the resource's name."
  type        = string
}

variable "location" {
  description = "The Azure region."
  type        = string
}

variable "resource_group_name" {
  description = "The resource group that holds the VM."
  type        = string
}

variable "size" {
  description = "The VM size, such as Standard_B2ls_v2. The region must offer it and the subscription needs quota for its family."
  type        = string
}

variable "admin_username" {
  description = "The administrator account."
  type        = string
}

variable "admin_ssh_public_key" {
  description = "The SSH public key that logs in as the administrator. The VM has no password login."
  type        = string
}

variable "network_interface_ids" {
  description = "The network interfaces the VM uses."
  type        = list(string)
}

variable "custom_data" {
  description = "Base64 text cloud-init reads on the VM's first boot. Changing it replaces the VM."
  type        = string
  default     = null
  sensitive   = true
}

variable "tags" {
  description = "Tags for the VM."
  type        = map(string)
  default     = {}
}
