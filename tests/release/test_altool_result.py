import importlib.util
import pathlib
import unittest

PATH = pathlib.Path(__file__).resolve().parents[2] / 'scripts/release/check-altool-result.py'
spec = importlib.util.spec_from_file_location('altool_result', PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class UploadResult(unittest.TestCase):
    def test_require_success_message(self):
        self.assertEqual(module.check({'success-message': 'No errors uploading archive.'}), 'No errors uploading archive.')
        for data in [{}, {'success-message': ''}, {'success-message': None}]:
            with self.subTest(data=data), self.assertRaises(ValueError):
                module.check(data)

    def test_product_errors_take_priority_over_success_message(self):
        with self.assertRaisesRegex(ValueError, 'Apple rejected'):
            module.check({'success-message': 'Uploaded', 'product-errors': [{'code': 409, 'message': 'Invalid bundle'}]})


if __name__ == '__main__':
    unittest.main()
