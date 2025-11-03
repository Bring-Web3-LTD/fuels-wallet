import { Route } from 'react-router-dom';

import { Pages } from '../Core/types';

import { SelectCashbackAddress } from './pages';

export const crxRoutes = (
  <Route
    path={Pages.selectCashbackAddress()}
    element={<SelectCashbackAddress />}
  />
);
