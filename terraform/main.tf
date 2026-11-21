# A VM that runs the SIP server in docker/asterisk. It takes a carrier's calls, such as Zadarma's, and passes them to
# OpenAI. See docs/voice/external-numbers.md.

locals {
  rtp_range = "${var.rtp_start}-${var.rtp_end}"

  # An address no carrier uses, so the server starts and accepts nothing until carrier_ips is set.
  carrier_ips_for_server = length(var.carrier_ips) > 0 ? var.carrier_ips : ["192.0.2.1"]

  # The server's files, read from the repository, so the VM runs the same server the repository holds. The
  # settings come from the variables, so asterisk.env.example and .gitignore stay out.
  server_files = merge(
    { for name in ["Dockerfile", "entrypoint.sh", "docker-compose.yml"] : name => base64encode(file("${path.module}/../docker/asterisk/${name}")) },
    { for name in fileset("${path.module}/../docker/asterisk", "etc/*") : name => base64encode(file("${path.module}/../docker/asterisk/${name}")) },
  )

  tags = merge({ project = "lobbystack", purpose = "sip-server" }, var.tags)
}

resource "azurerm_resource_group" "sip" {
  name     = "${var.name_prefix}-rg"
  location = var.location
  tags     = local.tags
}

resource "azurerm_virtual_network" "sip" {
  name                = "${var.name_prefix}-vnet"
  location            = azurerm_resource_group.sip.location
  resource_group_name = azurerm_resource_group.sip.name
  address_space       = ["10.20.0.0/16"]
  tags                = local.tags
}

resource "azurerm_subnet" "sip" {
  name                 = "${var.name_prefix}-subnet"
  resource_group_name  = azurerm_resource_group.sip.name
  virtual_network_name = azurerm_virtual_network.sip.name
  address_prefixes     = ["10.20.1.0/24"]
}

# Static, because the carrier routes each number to this address, and a dynamic one changes when the VM restarts.
resource "azurerm_public_ip" "sip" {
  name                = "${var.name_prefix}-ip"
  location            = azurerm_resource_group.sip.location
  resource_group_name = azurerm_resource_group.sip.name
  allocation_method   = "Static"
  sku                 = "Standard"
  domain_name_label   = var.dns_label
  tags                = local.tags
}

# Azure denies everything inbound that no rule allows. Only these rules open anything.
resource "azurerm_network_security_group" "sip" {
  name                = "${var.name_prefix}-nsg"
  location            = azurerm_resource_group.sip.location
  resource_group_name = azurerm_resource_group.sip.name
  tags                = local.tags
}

resource "azurerm_network_security_rule" "sip_from_carrier" {
  count                       = length(var.carrier_ips) > 0 ? 1 : 0
  name                        = "sip-from-carrier"
  priority                    = 100
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Udp"
  source_port_range           = "*"
  destination_port_range      = "5060"
  source_address_prefixes     = var.carrier_ips
  destination_address_prefix  = "*"
  resource_group_name         = azurerm_resource_group.sip.name
  network_security_group_name = azurerm_network_security_group.sip.name
}

resource "azurerm_network_security_rule" "audio_from_carrier" {
  count                       = length(var.carrier_ips) > 0 ? 1 : 0
  name                        = "audio-from-carrier"
  priority                    = 110
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Udp"
  source_port_range           = "*"
  destination_port_range      = local.rtp_range
  source_address_prefixes     = var.carrier_ips
  destination_address_prefix  = "*"
  resource_group_name         = azurerm_resource_group.sip.name
  network_security_group_name = azurerm_network_security_group.sip.name
}

resource "azurerm_network_security_rule" "audio_from_openai" {
  name                        = "audio-from-openai"
  priority                    = 120
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Udp"
  source_port_range           = "*"
  destination_port_range      = local.rtp_range
  source_address_prefixes     = var.openai_media_cidrs
  destination_address_prefix  = "*"
  resource_group_name         = azurerm_resource_group.sip.name
  network_security_group_name = azurerm_network_security_group.sip.name
}

resource "azurerm_network_security_rule" "ssh" {
  count                       = length(var.ssh_allowed_cidrs) > 0 ? 1 : 0
  name                        = "ssh"
  priority                    = 200
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_range      = "22"
  source_address_prefixes     = var.ssh_allowed_cidrs
  destination_address_prefix  = "*"
  resource_group_name         = azurerm_resource_group.sip.name
  network_security_group_name = azurerm_network_security_group.sip.name
}

resource "azurerm_network_interface" "sip" {
  name                = "${var.name_prefix}-nic"
  location            = azurerm_resource_group.sip.location
  resource_group_name = azurerm_resource_group.sip.name
  tags                = local.tags

  ip_configuration {
    name                          = "primary"
    subnet_id                     = azurerm_subnet.sip.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.sip.id
  }
}

resource "azurerm_network_interface_security_group_association" "sip" {
  network_interface_id      = azurerm_network_interface.sip.id
  network_security_group_id = azurerm_network_security_group.sip.id
}

resource "azurerm_linux_virtual_machine" "sip" {
  name                            = "${var.name_prefix}-vm"
  location                        = azurerm_resource_group.sip.location
  resource_group_name             = azurerm_resource_group.sip.name
  size                            = var.vm_size
  admin_username                  = var.admin_username
  disable_password_authentication = true
  network_interface_ids           = [azurerm_network_interface.sip.id]
  tags                            = local.tags

  admin_ssh_key {
    username   = var.admin_username
    public_key = var.ssh_public_key
  }

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "StandardSSD_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "ubuntu-24_04-lts"
    sku       = "server"
    version   = "latest"
  }

  # The server's settings and files are written on first boot. Changing them replaces the VM, and the static
  # address stays. See README.md.
  custom_data = base64encode(templatefile("${path.module}/cloud-init.yaml.tftpl", {
    files                = local.server_files
    openai_project_id    = var.openai_project_id
    carrier_ips          = join(",", local.carrier_ips_for_server)
    public_ip            = azurerm_public_ip.sip.ip_address
    default_country_code = var.default_country_code
    caller_header        = var.caller_header
    rtp_start            = var.rtp_start
    rtp_end              = var.rtp_end
  }))
}
