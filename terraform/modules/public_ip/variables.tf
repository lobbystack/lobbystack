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
