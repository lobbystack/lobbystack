variable "name" {
  description = "The virtual network's name."
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

variable "address_space" {
  description = "The address ranges of the network, such as [\"10.20.0.0/16\"]."
  type        = list(string)
}

variable "tags" {
  description = "Tags for the virtual network."
  type        = map(string)
  default     = {}
}
