import React, { createContext, useContext } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { AppServices } from '../services';

const ServicesContext = createContext<AppServices | null>(null);

interface Props {
  services: AppServices;
  children: React.ReactNode;
}

export function ServicesProvider({ services, children }: Props) {
  return (
    <ServicesContext.Provider value={services}>
      <QueryClientProvider client={services.queryClient}>
        {children}
      </QueryClientProvider>
    </ServicesContext.Provider>
  );
}

export function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (!services) {
    throw new Error('useServices must be used inside ServicesProvider');
  }
  return services;
}
