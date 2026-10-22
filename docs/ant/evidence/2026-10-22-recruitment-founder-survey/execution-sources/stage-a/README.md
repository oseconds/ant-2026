# Stage A execution sources

`ant-recruitment-descriptors.js` is the byte-preserved descriptor source used by the completed 12 Stage A runs. Its SHA-256 is `b0c64138b545b2d33662ef94081824e79092742b310edfabac7fa02cc960770d`, matching the Stage A receipts.

In that frozen version, `ants.gyrationRadius` was the RMS distance from the nest. It was mislabeled as colony dispersion in raw frame metrics. Stage A raw metrics and receipts remain unchanged; the analysis derives centroid dispersion as `sqrt(covariance.xx + covariance.yy)`. The current helper now reports that corrected quantity as `gyrationRadius` and preserves the former measure as `rmsRadiusFromNest`.
