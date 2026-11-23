variable "name" {
  description = "The network security group's name."
  type        = string
}

variable "location" {
  description = "The Azure region."
  type        = string
}

variable "resource_group_name" {
  description = "The resource group that holds the group."
  type        = string
}

variable "tags" {
  description = "Tags for the network security group."
  type        = map(string)
  default     = {}
}
