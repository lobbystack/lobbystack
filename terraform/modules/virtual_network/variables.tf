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
  description = "The resource group that holds the network."
  type        = string
}

variable "tags" {
  description = "Tags for the virtual network."
  type        = map(string)
  default     = {}
}
