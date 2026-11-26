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

variable "tags" {
  description = "Tags for the interface."
  type        = map(string)
  default     = {}
}
