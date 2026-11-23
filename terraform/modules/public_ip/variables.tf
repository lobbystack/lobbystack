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
  description = "The resource group that holds the address."
  type        = string
}

variable "allocation_method" {
  description = "Static keeps the address when the VM restarts. Dynamic doesn't."
  type        = string
  default     = "Static"

  validation {
    condition     = contains(["Static", "Dynamic"], var.allocation_method)
    error_message = "allocation_method is Static or Dynamic."
  }
}

variable "sku" {
  description = "Basic or Standard. A Standard address is always Static."
  type        = string
  default     = "Standard"

  validation {
    condition     = contains(["Basic", "Standard"], var.sku)
    error_message = "sku is Basic or Standard."
  }
}

variable "domain_name_label" {
  description = "A name giving <label>.<region>.cloudapp.azure.com. Null gives none. It must be unique in the region."
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags for the address."
  type        = map(string)
  default     = {}
}
