variable "name" {
  description = "The network interface's name."
  type        = string
}

variable "location" {
  description = "The Azure region."
  type        = string
}

variable "resource_group_name" {
  description = "The resource group that holds the interface."
  type        = string
}

variable "subnet_id" {
  description = "The subnet the interface attaches to."
  type        = string
}

variable "public_ip_address_id" {
  description = "The public address resource the interface carries. Null gives it none."
  type        = string
  default     = null
}

variable "private_ip_address_allocation" {
  description = "Dynamic or Static."
  type        = string
  default     = "Dynamic"

  validation {
    condition     = contains(["Dynamic", "Static"], var.private_ip_address_allocation)
    error_message = "private_ip_address_allocation is Dynamic or Static."
  }
}

variable "tags" {
  description = "Tags for the interface."
  type        = map(string)
  default     = {}
}
