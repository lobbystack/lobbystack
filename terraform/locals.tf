locals {
  tags = merge({ project = "lobbystack", purpose = "sip-server", environment = var.environment }, var.tags)

  rtp_range = "${var.rtp_start}-${var.rtp_end}"

  # An address no carrier uses, so the server starts and accepts nothing until carrier_ips is set.
  carrier_ips_for_server = length(var.carrier_ips) > 0 ? var.carrier_ips : ["192.0.2.1"]

  # The server's files, read from the repository, so the VM runs the same server the repository holds. The
  # settings come from the variables, so asterisk.env.example and .gitignore stay out.
  server_files = merge(
    { for name in ["Dockerfile", "entrypoint.sh", "docker-compose.yml"] : name => base64encode(file("${path.module}/../docker/asterisk/${name}")) },
    { for name in fileset("${path.module}/../docker/asterisk", "etc/*") : name => base64encode(file("${path.module}/../docker/asterisk/${name}")) },
  )

  # The files the VM writes on its first boot: the server's own, then its settings. They reach cloud-init as JSON,
  # which is valid YAML, so templates/cloud-init.yaml.tftpl stays valid YAML and editors don't flag it.
  cloud_init_files = concat(
    [for path, content in local.server_files : {
      path        = "/opt/lobbystack-sip/${path}"
      encoding    = "b64"
      permissions = path == "entrypoint.sh" ? "0755" : "0644"
      content     = content
    }],
    [{
      path        = "/opt/lobbystack-sip/asterisk.env"
      permissions = "0600"
      content = join("\n", [
        "OPENAI_PROJECT_ID=${var.openai_project_id}",
        "CARRIER_IPS=${join(",", local.carrier_ips_for_server)}",
        "PUBLIC_IP=${module.public_ip.ip_address}",
        "DEFAULT_COUNTRY_CODE=${var.default_country_code}",
        "CALLER_HEADER=${var.caller_header}",
        "SIP_UDP_PORT=5060",
        "RTP_START=${var.rtp_start}",
        "RTP_END=${var.rtp_end}",
        "",
      ])
    }],
  )

  # The server's settings and files are written on first boot. Changing them replaces the VM, and the static
  # address stays. See README.md.
  cloud_init = templatefile("${path.module}/templates/cloud-init.yaml.tftpl", { write_files = jsonencode(local.cloud_init_files) })

  # Every rule the server could have. A rule with `enabled` false isn't created: the carrier's rules wait for
  # carrier_ips, and SSH waits for ssh_allowed_cidrs.
  network_security_rule_candidates = {
    sip-from-carrier = {
      enabled                 = length(var.carrier_ips) > 0
      priority                = 100
      protocol                = "Udp"
      destination_port_range  = "5060"
      source_address_prefixes = var.carrier_ips
    }
    audio-from-carrier = {
      enabled                 = length(var.carrier_ips) > 0
      priority                = 110
      protocol                = "Udp"
      destination_port_range  = local.rtp_range
      source_address_prefixes = var.carrier_ips
    }
    audio-from-openai = {
      enabled                 = true
      priority                = 120
      protocol                = "Udp"
      destination_port_range  = local.rtp_range
      source_address_prefixes = var.openai_media_cidrs
    }
    ssh = {
      enabled                 = length(var.ssh_allowed_cidrs) > 0
      priority                = 200
      protocol                = "Tcp"
      destination_port_range  = "22"
      source_address_prefixes = var.ssh_allowed_cidrs
    }
  }

  network_security_rules = { for name, rule in local.network_security_rule_candidates : name => rule if rule.enabled }
}
