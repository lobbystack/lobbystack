# Data sources the configuration reads from Azure. It needs none yet: the subscription comes from `az login` or
# subscription_id, and every value the resources share comes from locals.tf or another module's outputs. Add a
# `data` block here when a resource has to read something that exists already, such as a shared virtual network.
