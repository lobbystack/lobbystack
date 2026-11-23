variable "app_name" {
  description = "The application name, the first part of the resource's name."
  type        = string
}

variable "environment" {
  description = "The environment, the last part of the resource's name."
  type        = string
}

variable "resource_group_name" {
  description = "The resource group that holds the virtual network."
  type        = string
}

variable "virtual_network_name" {
  description = "The virtual network the subnet belongs to."
  type        = string
}

variable "address_prefixes" {
  description = "The subnet's address ranges, inside the network's, such as [\"10.20.1.0/24\"]."
  type        = list(string)
}
